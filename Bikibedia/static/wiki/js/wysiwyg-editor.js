(function () {
    'use strict';

    var mount = document.getElementById('wysiwyg-editor');
    var source = document.querySelector('[data-wysiwyg-source]');
    var form = document.querySelector('.article-form');
    if (!mount || !source || !window.Quill) {
        return;
    }

    var uploadUrl = mount.getAttribute('data-upload-url');
    var tabId = window.BIKIBEDIA_TAB_ID || '';
    var MIN_IMAGE_SIZE = 64;
    var THUMB_ALIGNS = ['left', 'center', 'right', 'wide', 'none'];
    var editorContainer = null;
    var editorRoot = null;
    var quill = null;

    var BlockEmbed = Quill.import('blots/block/embed');
    var Delta = Quill.import('delta');
    var Parchment = Quill.import('parchment');
    var THUMB_BLOT_NAME = 'wikithumb';

    function escapeAttr(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function readCaptionText(node) {
        if (!node) {
            return '';
        }
        if (node.tagName === 'TEXTAREA') {
            return node.value;
        }
        return (node.textContent || '').trim();
    }

    function createCaptionElement(value) {
        var caption = document.createElement('textarea');
        caption.className = 'wiki-thumb-caption';
        caption.setAttribute('rows', '1');
        caption.setAttribute('placeholder', 'Add caption…');
        caption.value = (value && value.caption) || '';
        return caption;
    }

    function autoResizeCaption(textarea) {
        if (!textarea) {
            return;
        }
        textarea.style.height = 'auto';
        textarea.style.height = Math.max(textarea.scrollHeight, 22) + 'px';
    }

    function bindCaptionElement(caption) {
        if (!caption || caption.dataset.captionReady === '1') {
            return;
        }
        caption.dataset.captionReady = '1';
        caption.addEventListener('input', function () {
            autoResizeCaption(caption);
            syncBodyToSource();
        });
        caption.addEventListener('mousedown', function (event) {
            event.stopPropagation();
        });
        caption.addEventListener('click', function (event) {
            event.stopPropagation();
        });
        caption.addEventListener('focus', function () {
            if (typeof imageTools !== 'undefined' && imageTools) {
                imageTools.clear();
            }
            quill.blur();
        });
        autoResizeCaption(caption);
    }

    function prepareCaptions() {
        editorRoot.querySelectorAll('.wiki-thumb-caption').forEach(function (caption) {
            if (caption.tagName === 'TEXTAREA') {
                bindCaptionElement(caption);
                return;
            }

            var textarea = createCaptionElement({ caption: readCaptionText(caption) });
            caption.replaceWith(textarea);
            bindCaptionElement(textarea);
        });
    }

    function serializeEditorHtml() {
        var clone = editorRoot.cloneNode(true);
        clone.querySelectorAll('.wiki-thumb-caption').forEach(function (node) {
            var text = readCaptionText(node);
            var paragraph = document.createElement('p');
            paragraph.className = 'wiki-thumb-caption';
            paragraph.textContent = text;
            node.replaceWith(paragraph);
        });
        var html = clone.innerHTML.trim();
        if (html === '<p><br></p>') {
            html = '';
        }
        return html;
    }

    function insertTextIntoTextarea(textarea, text) {
        if (!textarea || !text) {
            return;
        }

        var start = textarea.selectionStart || 0;
        var end = textarea.selectionEnd || 0;
        var value = textarea.value;
        textarea.value = value.slice(0, start) + text + value.slice(end);
        var cursor = start + text.length;
        textarea.selectionStart = cursor;
        textarea.selectionEnd = cursor;
    }

    function pasteIntoCaption(caption, clipboardData) {
        if (!caption || caption.tagName !== 'TEXTAREA') {
            return;
        }

        var text = clipboardData ? clipboardData.getData('text/plain') : '';
        if (!text) {
            return;
        }

        insertTextIntoTextarea(caption, text);
        autoResizeCaption(caption);
        syncBodyToSource();
    }

    function isCaptionField(element) {
        return !!(element && element.classList && element.classList.contains('wiki-thumb-caption'));
    }

    function setupCaptionKeyboardIsolation() {
        document.addEventListener('keydown', function (event) {
            if (!isCaptionField(document.activeElement)) {
                return;
            }

            if (event.ctrlKey || event.metaKey) {
                event.stopImmediatePropagation();
            }
        }, true);

        document.addEventListener('paste', function (event) {
            var caption = event.target.closest('.wiki-thumb-caption');
            if (!caption || !editorRoot.contains(caption)) {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();
            pasteIntoCaption(caption, event.clipboardData || window.clipboardData);
        }, true);
    }

    function buildThumbHtml(value) {
        var align = (value && value.align) || 'right';
        var src = escapeAttr(value && value.src);
        var width = value && value.width ? ' width="' + escapeAttr(value.width) + '"' : '';
        var height = value && value.height ? ' height="' + escapeAttr(value.height) + '"' : '';
        var caption = value && value.caption ? escapeAttr(value.caption) : '';
        return (
            '<div class="wiki-thumb wiki-thumb--' + align + '">' +
                '<img src="' + src + '" draggable="false"' + width + height + '>' +
                '<p class="wiki-thumb-caption">' + caption + '</p>' +
            '</div>'
        );
    }

    function parseThumbAlign(node) {
        var match = node.className.match(/wiki-thumb--(left|center|right|wide|none)/);
        return match ? match[1] : 'none';
    }

    function applyThumbAlign(node, align) {
        THUMB_ALIGNS.forEach(function (name) {
            node.classList.remove('wiki-thumb--' + name);
        });
        node.classList.add('wiki-thumb--' + (align || 'none'));
    }

    function thumbValueFromNode(node) {
        var img = node.querySelector('img');
        var caption = node.querySelector('.wiki-thumb-caption');
        return {
            src: img ? img.getAttribute('src') : '',
            width: img ? img.getAttribute('width') : '',
            height: img ? img.getAttribute('height') : '',
            align: parseThumbAlign(node),
            caption: readCaptionText(caption),
            alt: img ? img.getAttribute('alt') : '',
        };
    }

    function WikiThumbBlot(domNode) {
        BlockEmbed.call(this, domNode);
    }

    WikiThumbBlot.prototype = Object.create(BlockEmbed.prototype);
    WikiThumbBlot.prototype.constructor = WikiThumbBlot;

    WikiThumbBlot.create = function (value) {
        var node = BlockEmbed.create.call(WikiThumbBlot);
        node.setAttribute('contenteditable', 'false');
        node.classList.add('wiki-thumb');
        applyThumbAlign(node, value && value.align);

        var img = document.createElement('img');
        img.setAttribute('src', (value && value.src) || '');
        img.setAttribute('draggable', 'false');
        if (value && value.width) {
            img.setAttribute('width', value.width);
        }
        if (value && value.height) {
            img.setAttribute('height', value.height);
        }
        if (value && value.alt) {
            img.setAttribute('alt', value.alt);
        }
        node.appendChild(img);
        node.appendChild(createCaptionElement(value));

        return node;
    };

    WikiThumbBlot.value = function (node) {
        return thumbValueFromNode(node);
    };

    WikiThumbBlot.formats = function () {
        return {};
    };

    WikiThumbBlot.blotName = THUMB_BLOT_NAME;
    WikiThumbBlot.tagName = 'DIV';
    WikiThumbBlot.scope = Parchment.Scope.BLOCK_BLOT;

    Quill.register(WikiThumbBlot, true);

    function getCookie(name) {
        var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? decodeURIComponent(match[2]) : '';
    }

    function uploadImage(file) {
        var body = new FormData();
        body.append('image', file);
        body.append('csrfmiddlewaretoken', getCookie('csrftoken'));
        if (tabId) {
            body.append('_tab', tabId);
        }

        var url = uploadUrl;
        if (tabId) {
            url += (url.indexOf('?') === -1 ? '?' : '&') + '__tab=' + encodeURIComponent(tabId);
        }

        return fetch(url, {
            method: 'POST',
            body: body,
            credentials: 'same-origin',
        }).then(function (response) {
            return response.json().then(function (data) {
                if (!response.ok) {
                    throw new Error(data.error || 'Upload failed.');
                }
                return data.url;
            });
        });
    }

    function thumbInsertDelta(value) {
        var payload = {};
        payload[THUMB_BLOT_NAME] = value;
        return new Delta().insert(payload);
    }

    function wrapImageNodeAsThumb(img, align) {
        if (!img || img.closest('.wiki-thumb')) {
            return null;
        }

        var thumb = document.createElement('div');
        thumb.className = 'wiki-thumb wiki-thumb--' + (align || 'right');
        thumb.setAttribute('contenteditable', 'false');

        var parent = img.parentNode;
        if (parent && parent.tagName === 'P' && parent.childNodes.length === 1) {
            parent.replaceWith(thumb);
        } else if (parent) {
            parent.insertBefore(thumb, img);
            img.remove();
        }

        thumb.appendChild(img);
        thumb.appendChild(createCaptionElement(null));
        return thumb;
    }

    function insertThumbFallback(index, payload) {
        quill.insertEmbed(index, 'image', payload.src, 'user');
        quill.insertText(index + 1, '\n', 'user');
        var img = null;
        editorRoot.querySelectorAll('img').forEach(function (node) {
            if (node.getAttribute('src') === payload.src && !node.closest('.wiki-thumb')) {
                img = node;
            }
        });
        if (img) {
            wrapImageNodeAsThumb(img, payload.align || 'right');
        }
        quill.setSelection(index + 2, 'silent');
    }

    function insertThumbAt(index, url) {
        var payload = {
            src: url,
            align: 'right',
            caption: '',
        };

        try {
            quill.insertEmbed(index, THUMB_BLOT_NAME, payload, 'user');
            quill.insertText(index + 1, '\n', 'user');
            quill.setSelection(index + 2, 'silent');
        } catch (error) {
            insertThumbFallback(index, payload);
        }

        prepareEditorImages();
    }

    quill = new Quill(mount, {
        theme: 'snow',
        placeholder: 'Write your article…',
        modules: {
            toolbar: {
                container: [
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ header: [2, 3, false] }],
                    [{ list: 'ordered' }, { list: 'bullet' }],
                    ['blockquote', 'code-block'],
                    ['link', 'image'],
                    ['clean'],
                ],
                handlers: {
                    image: function imageHandler() {
                        var input = document.createElement('input');
                        input.setAttribute('type', 'file');
                        input.setAttribute('accept', 'image/*');
                        input.click();

                        input.onchange = function () {
                            var file = input.files && input.files[0];
                            if (!file) {
                                return;
                            }

                            var range = quill.getSelection(true) || { index: quill.getLength() };
                            quill.enable(false);

                            uploadImage(file)
                                .then(function (url) {
                                    quill.enable(true);
                                    insertThumbAt(range.index, url);
                                    var thumb = editorRoot.querySelector('.wiki-thumb:last-of-type img');
                                    if (thumb && imageTools) {
                                        imageTools.select(thumb);
                                    }
                                })
                                .catch(function (error) {
                                    quill.enable(true);
                                    window.alert(error.message || 'Could not upload image.');
                                });
                        };
                    },
                },
            },
        },
    });

    editorRoot = quill.root;
    editorContainer = mount.querySelector('.ql-container') || editorRoot.parentElement;

    if (!editorContainer) {
        window.alert('Editor failed to initialize.');
        return;
    }

    setupCaptionKeyboardIsolation();

    function syncQuillTheme() {
        if (!mount) {
            return;
        }

        var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        var theme = isDark ? 'dark' : 'light';
        var iconColor = isDark ? '#e7edf3' : '#5c6570';
        var pickerBg = isDark ? '#1e2530' : '#ffffff';
        var pickerText = isDark ? '#e7edf3' : '#1a1d21';
        var pickerBorder = isDark ? '#3a4a5c' : '#c8d0da';

        mount.setAttribute('data-quill-theme', theme);

        mount.querySelectorAll('.ql-picker-options').forEach(function (node) {
            node.style.setProperty('background-color', pickerBg, 'important');
            node.style.setProperty('border-color', pickerBorder, 'important');
        });

        mount.querySelectorAll('.ql-picker-item').forEach(function (node) {
            node.style.setProperty('color', pickerText, 'important');
        });

        mount.querySelectorAll('.ql-picker-label, .ql-picker').forEach(function (node) {
            node.style.setProperty('color', iconColor, 'important');
        });

        mount.querySelectorAll('.ql-tooltip').forEach(function (node) {
            node.style.setProperty('background-color', pickerBg, 'important');
            node.style.setProperty('border-color', pickerBorder, 'important');
            node.style.setProperty('color', pickerText, 'important');
        });

        mount.querySelectorAll('.ql-tooltip input[type="text"]').forEach(function (node) {
            node.style.setProperty('background-color', isDark ? '#121820' : '#ffffff', 'important');
            node.style.setProperty('border-color', pickerBorder, 'important');
            node.style.setProperty('color', pickerText, 'important');
        });
    }

    syncQuillTheme();
    window.requestAnimationFrame(syncQuillTheme);

    document.addEventListener('bikibedia:theme-change', syncQuillTheme);

    var themeObserver = new MutationObserver(syncQuillTheme);
    themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
    });

    var toolbar = mount.querySelector('.ql-toolbar');
    if (toolbar) {
        new MutationObserver(syncQuillTheme).observe(toolbar, {
            childList: true,
            subtree: true,
        });
    }

    quill.clipboard.addMatcher('DIV.wiki-thumb', function (node) {
        return thumbInsertDelta(thumbValueFromNode(node));
    });

    quill.clipboard.addMatcher('IMG', function (node) {
        if (node.closest('.wiki-thumb')) {
            return new Delta();
        }
        return thumbInsertDelta({
            src: node.getAttribute('src') || '',
            width: node.getAttribute('width') || '',
            height: node.getAttribute('height') || '',
            align: 'none',
            caption: node.getAttribute('alt') || '',
            alt: node.getAttribute('alt') || '',
        });
    });

    function preventImageDrag(event) {
        event.preventDefault();
    }

    function prepareEditorImages() {
        editorRoot.querySelectorAll('img').forEach(function (img) {
            img.setAttribute('draggable', 'false');
            if (!img.dataset.dragFixed) {
                img.dataset.dragFixed = '1';
                img.addEventListener('dragstart', preventImageDrag);
            }
        });
        prepareCaptions();
    }

    editorRoot.addEventListener('mousedown', function (event) {
        if (event.target.closest('.wiki-thumb-caption')) {
            event.stopPropagation();
        }
    }, true);

    editorRoot.addEventListener('dragstart', function (event) {
        if (event.target && event.target.tagName === 'IMG') {
            event.preventDefault();
        }
    });

    editorRoot.addEventListener('dragover', function (event) {
        var hasFiles = event.dataTransfer.types && Array.prototype.indexOf.call(event.dataTransfer.types, 'Files') !== -1;
        if (!hasFiles) {
            event.preventDefault();
        }
    });

    editorRoot.addEventListener('drop', function (event) {
        if (!event.dataTransfer.files || !event.dataTransfer.files.length) {
            event.preventDefault();
            event.stopPropagation();
        }
    });

    var imageTools = (function createImageTools() {
        var activeImg = null;
        var activeThumb = null;
        var overlay = null;
        var frame = null;
        var handle = null;
        var toolbar = null;
        var dragState = null;

        overlay = document.createElement('div');
        overlay.className = 'image-resize-overlay';
        overlay.hidden = true;

        frame = document.createElement('div');
        frame.className = 'image-resize-frame';

        handle = document.createElement('div');
        handle.className = 'image-resize-handle image-resize-handle--corner';
        handle.title = 'Resize';

        frame.appendChild(handle);
        overlay.appendChild(frame);

        toolbar = document.createElement('div');
        toolbar.className = 'image-toolbar';
        toolbar.hidden = true;
        toolbar.innerHTML =
            '<div class="image-toolbar-group" role="group" aria-label="Image alignment">' +
                '<button type="button" class="image-toolbar-btn" data-align="left" title="Float left"><span aria-hidden="true">←</span></button>' +
                '<button type="button" class="image-toolbar-btn" data-align="center" title="Center"><span aria-hidden="true">↔</span></button>' +
                '<button type="button" class="image-toolbar-btn" data-align="right" title="Float right"><span aria-hidden="true">→</span></button>' +
                '<button type="button" class="image-toolbar-btn" data-align="wide" title="Full width"><span aria-hidden="true">▭</span></button>' +
                '<button type="button" class="image-toolbar-btn" data-align="none" title="Inline"><span aria-hidden="true">▪</span></button>' +
            '</div>' +
            '<div class="image-toolbar-group" role="group" aria-label="Move image">' +
                '<button type="button" class="image-toolbar-btn" data-move="up" title="Move up">↑</button>' +
                '<button type="button" class="image-toolbar-btn" data-move="down" title="Move down">↓</button>' +
            '</div>' +
            '<div class="image-toolbar-group" role="group" aria-label="Delete image">' +
                '<button type="button" class="image-toolbar-btn image-toolbar-btn--danger" data-action="delete" title="Delete image" aria-label="Delete image">×</button>' +
            '</div>';

        editorContainer.appendChild(overlay);
        editorContainer.appendChild(toolbar);

        function clampSize(value, min, max) {
            return Math.max(min, Math.min(max, value));
        }

        function editorMaxWidth() {
            return editorRoot.clientWidth - 16;
        }

        function thumbInnerMaxWidth(thumb) {
            if (thumb) {
                return Math.max(MIN_IMAGE_SIZE, thumb.clientWidth - 12);
            }
            return editorMaxWidth();
        }

        function getThumbMaxWidth() {
            if (!activeThumb) {
                return editorMaxWidth();
            }
            var align = parseThumbAlign(activeThumb);
            if (align === 'wide') {
                return thumbInnerMaxWidth(activeThumb);
            }
            if (align === 'left' || align === 'right') {
                return Math.min(editorMaxWidth(), 320);
            }
            if (align === 'center') {
                return Math.min(editorMaxWidth(), 420);
            }
            return Math.min(editorMaxWidth(), 360);
        }

        function normalizeThumbImage(thumb, align) {
            var img = thumb && thumb.querySelector('img');
            if (!img) {
                return;
            }

            img.style.width = '';
            img.style.height = '';
            img.style.maxWidth = '';

            if (align === 'wide') {
                img.removeAttribute('width');
                img.removeAttribute('height');
                if (thumb) {
                    thumb.style.width = '';
                }
            }
        }

        function syncThumbContainerWidth(width) {
            if (!activeThumb) {
                return;
            }

            var align = parseThumbAlign(activeThumb);
            if (align === 'wide') {
                activeThumb.style.width = '';
                return;
            }

            activeThumb.style.width = Math.min(width + 12, getThumbMaxWidth() + 12) + 'px';
        }

        function syncOverlay() {
            if (!activeImg || overlay.hidden || !editorContainer) {
                return;
            }

            var containerRect = editorContainer.getBoundingClientRect();
            var targetRect = activeImg.getBoundingClientRect();

            overlay.style.left = (targetRect.left - containerRect.left) + 'px';
            overlay.style.top = (targetRect.top - containerRect.top) + 'px';
            overlay.style.width = targetRect.width + 'px';
            overlay.style.height = targetRect.height + 'px';

            if (!toolbar.hidden) {
                var toolbarWidth = toolbar.offsetWidth || 0;
                var left = targetRect.left - containerRect.left + (targetRect.width / 2) - (toolbarWidth / 2);
                left = clampSize(left, 4, editorContainer.clientWidth - toolbarWidth - 4);
                toolbar.style.left = left + 'px';
                toolbar.style.top = Math.max(4, targetRect.top - containerRect.top - toolbar.offsetHeight - 8) + 'px';
            }
        }

        function updateToolbarState() {
            if (!activeThumb) {
                return;
            }
            var align = parseThumbAlign(activeThumb);
            toolbar.querySelectorAll('[data-align]').forEach(function (button) {
                button.classList.toggle('is-active', button.getAttribute('data-align') === align);
            });
        }

        function clearSelection() {
            activeImg = null;
            activeThumb = null;
            overlay.hidden = true;
            toolbar.hidden = true;
            editorRoot.querySelectorAll('img.is-selected').forEach(function (img) {
                img.classList.remove('is-selected');
            });
            editorRoot.querySelectorAll('.wiki-thumb.is-selected').forEach(function (thumb) {
                thumb.classList.remove('is-selected');
            });
        }

        function select(img) {
            if (!img || img.tagName !== 'IMG') {
                return;
            }

            activeImg = img;
            activeThumb = img.closest('.wiki-thumb');

            editorRoot.querySelectorAll('img.is-selected').forEach(function (node) {
                node.classList.remove('is-selected');
            });
            editorRoot.querySelectorAll('.wiki-thumb.is-selected').forEach(function (node) {
                node.classList.remove('is-selected');
            });

            img.classList.add('is-selected');
            if (activeThumb) {
                activeThumb.classList.add('is-selected');
            }

            overlay.hidden = false;
            toolbar.hidden = false;
            updateToolbarState();
            syncOverlay();
        }

        function applySize(width, height) {
            if (!activeImg) {
                return;
            }

            var align = activeThumb ? parseThumbAlign(activeThumb) : 'none';
            if (align === 'wide') {
                applyThumbAlign(activeThumb, 'center');
                align = 'center';
                updateToolbarState();
            }

            var aspect = dragState ? (dragState.startWidth / dragState.startHeight) : (width / height);
            if (dragState && aspect > 0) {
                height = Math.round(width / aspect);
            }

            var maxWidth = getThumbMaxWidth();
            width = clampSize(Math.round(width), MIN_IMAGE_SIZE, maxWidth);
            height = clampSize(Math.round(height), MIN_IMAGE_SIZE, 1200);

            activeImg.style.width = '';
            activeImg.style.height = '';
            activeImg.style.maxWidth = '';
            activeImg.setAttribute('width', String(width));
            activeImg.setAttribute('height', String(height));
            syncThumbContainerWidth(width);
            syncOverlay();
        }

        function setAlign(align) {
            if (!activeThumb) {
                return;
            }
            applyThumbAlign(activeThumb, align);
            if (align === 'wide') {
                normalizeThumbImage(activeThumb, align);
            } else {
                var img = activeThumb.querySelector('img');
                var imgWidth = img && img.getAttribute('width') ? parseInt(img.getAttribute('width'), 10) : 0;
                if (imgWidth) {
                    syncThumbContainerWidth(imgWidth);
                } else {
                    activeThumb.style.width = '';
                }
            }
            updateToolbarState();
            syncOverlay();
            syncBodyToSource();
        }

        function deleteSelectedThumb() {
            if (!activeImg) {
                return;
            }

            var thumb = activeThumb;
            var blot = Quill.find(thumb || activeImg);
            if (blot) {
                blot.remove();
            } else if (thumb) {
                thumb.remove();
            } else {
                activeImg.remove();
            }

            clearSelection();
            syncBodyToSource();
        }

        function moveThumbDom(direction) {
            var thumb = activeThumb;
            if (!thumb || !editorRoot.contains(thumb)) {
                return false;
            }

            var sibling = direction === 'up'
                ? thumb.previousElementSibling
                : thumb.nextElementSibling;

            if (!sibling || !editorRoot.contains(sibling)) {
                return false;
            }

            if (direction === 'up') {
                editorRoot.insertBefore(thumb, sibling);
            } else {
                editorRoot.insertBefore(thumb, sibling.nextSibling);
            }

            return true;
        }

        function moveThumb(direction) {
            if (!activeThumb) {
                return;
            }

            var thumb = activeThumb;
            var img = activeImg;
            var moved = false;
            var blot = Quill.find(thumb);

            if (blot && blot.parent) {
                var refBlot = direction === 'up' ? blot.prev : blot.next;
                if (refBlot) {
                    if (direction === 'up') {
                        blot.parent.insertBefore(blot, refBlot);
                    } else {
                        blot.parent.insertBefore(blot, refBlot.next);
                    }
                    moved = true;
                }
            }

            if (!moved) {
                moved = moveThumbDom(direction);
            }

            if (!moved) {
                return;
            }

            syncBodyToSource();

            requestAnimationFrame(function () {
                if (!editorRoot.contains(thumb)) {
                    return;
                }
                var nextImg = img && editorRoot.contains(img) ? img : thumb.querySelector('img');
                if (nextImg) {
                    select(nextImg);
                }
            });
        }

        function startDrag(mode, event) {
            if (!activeImg) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            var rect = activeImg.getBoundingClientRect();
            dragState = {
                mode: mode,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                startWidth: rect.width,
                startHeight: rect.height,
            };

            if (event.currentTarget.setPointerCapture) {
                event.currentTarget.setPointerCapture(event.pointerId);
            }

            overlay.classList.add('is-dragging');
            document.body.classList.add('image-resize-active');
        }

        function onDrag(event) {
            if (!dragState || !activeImg) {
                return;
            }

            event.preventDefault();

            var deltaX = event.clientX - dragState.startX;
            var deltaY = event.clientY - dragState.startY;
            var width = dragState.startWidth + deltaX;
            var height = dragState.startHeight + deltaY;

            applySize(width, height);
        }

        function stopDrag(event) {
            if (!dragState) {
                return;
            }

            if (event && event.currentTarget.releasePointerCapture) {
                try {
                    event.currentTarget.releasePointerCapture(dragState.pointerId);
                } catch (error) {
                    // Ignore if capture was already released.
                }
            }

            dragState = null;
            overlay.classList.remove('is-dragging');
            document.body.classList.remove('image-resize-active');
            syncBodyToSource();
        }

        handle.addEventListener('pointerdown', function (event) {
            startDrag('corner', event);
        });
        handle.addEventListener('pointermove', function (event) {
            if (dragState) {
                onDrag(event);
            }
        });
        handle.addEventListener('pointerup', stopDrag);
        handle.addEventListener('pointercancel', stopDrag);

        overlay.addEventListener('mousedown', function (event) {
            event.preventDefault();
            event.stopPropagation();
        });

        toolbar.addEventListener('mousedown', function (event) {
            event.preventDefault();
        });

        toolbar.addEventListener('click', function (event) {
            var alignBtn = event.target.closest('[data-align]');
            if (alignBtn) {
                event.preventDefault();
                setAlign(alignBtn.getAttribute('data-align'));
                return;
            }

            var moveBtn = event.target.closest('[data-move]');
            if (moveBtn) {
                event.preventDefault();
                moveThumb(moveBtn.getAttribute('data-move'));
                return;
            }

            var deleteBtn = event.target.closest('[data-action="delete"]');
            if (deleteBtn) {
                event.preventDefault();
                deleteSelectedThumb();
            }
        });

        editorRoot.addEventListener('click', function (event) {
            if (dragState) {
                return;
            }

            if (event.target.closest('.image-toolbar')) {
                return;
            }

            if (event.target.closest('.wiki-thumb-caption')) {
                return;
            }

            var img = event.target.closest('img');
            if (img && editorRoot.contains(img)) {
                event.preventDefault();
                select(img);
                return;
            }

            if (!overlay.contains(event.target)) {
                clearSelection();
            }
        });

        editorRoot.addEventListener('scroll', syncOverlay);
        window.addEventListener('resize', syncOverlay);

        quill.on('text-change', function (delta, oldDelta, source) {
            prepareEditorImages();
            if (source === 'user' && activeImg && !editorRoot.contains(activeImg)) {
                clearSelection();
            } else {
                syncOverlay();
            }
        });

        document.addEventListener('keydown', function (event) {
            if (!activeImg) {
                return;
            }
            if (event.key === 'Escape') {
                clearSelection();
            }
            if ((event.key === 'Delete' || event.key === 'Backspace') && !event.target.closest('.wiki-thumb-caption')) {
                deleteSelectedThumb();
                event.preventDefault();
            }
        });

        return {
            select: select,
            clear: clearSelection,
            sync: syncOverlay,
        };
    })();

    var quillToolbar = mount.querySelector('.ql-toolbar');
    if (quillToolbar) {
        quillToolbar.addEventListener('mousedown', function (event) {
            if (event.target.closest('.ql-image')) {
                return;
            }
            if (event.target.closest('button')) {
                imageTools.clear();
                quill.focus();
            }
        }, true);
    }

    function migratePlainImages() {
        var tasks = [];

        Array.from(editorRoot.querySelectorAll('img')).forEach(function (img) {
            if (img.closest('.wiki-thumb')) {
                return;
            }

            var blot = Quill.find(img);
            if (!blot) {
                return;
            }

            var index = quill.getIndex(blot);
            var parent = img.parentNode;
            if (parent && parent.tagName === 'P' && parent.childNodes.length === 1) {
                var parentBlot = Quill.find(parent);
                if (parentBlot) {
                    index = quill.getIndex(parentBlot);
                    blot = parentBlot;
                }
            }

            tasks.push({
                blot: blot,
                index: index,
                value: {
                    src: img.getAttribute('src') || '',
                    width: img.getAttribute('width') || '',
                    height: img.getAttribute('height') || '',
                    align: 'none',
                    caption: img.getAttribute('alt') || '',
                    alt: img.getAttribute('alt') || '',
                },
            });
        });

        tasks.sort(function (a, b) {
            return b.index - a.index;
        });

        tasks.forEach(function (task) {
            task.blot.remove();
            quill.insertEmbed(task.index, THUMB_BLOT_NAME, task.value, 'user');
            quill.insertText(task.index + 1, '\n', 'user');
        });

        prepareEditorImages();
    }

    function normalizeLoadedImages() {
        editorRoot.querySelectorAll('.wiki-thumb').forEach(function (thumb) {
            normalizeThumbImageForLoad(thumb);
        });
        editorRoot.querySelectorAll('.wiki-thumb img').forEach(function (img) {
            var thumb = img.closest('.wiki-thumb');
            var align = thumb ? parseThumbAlign(thumb) : 'none';
            if (align !== 'wide') {
                if (!img.getAttribute('width') && img.style.width) {
                    var width = parseInt(img.style.width, 10);
                    if (width) {
                        img.setAttribute('width', String(width));
                    }
                }
                if (!img.getAttribute('height') && img.style.height) {
                    var height = parseInt(img.style.height, 10);
                    if (height) {
                        img.setAttribute('height', String(height));
                    }
                }
            }
            img.style.width = '';
            img.style.height = '';
            img.style.maxWidth = '';
        });
        prepareEditorImages();
    }

    function normalizeThumbImageForLoad(thumb) {
        if (!thumb) {
            return;
        }
        var align = parseThumbAlign(thumb);
        var img = thumb.querySelector('img');
        if (!img) {
            return;
        }
        img.style.width = '';
        img.style.height = '';
        img.style.maxWidth = '';
        if (align === 'wide') {
            img.removeAttribute('width');
            img.removeAttribute('height');
        }
    }

    if (source.value.trim()) {
        quill.clipboard.dangerouslyPasteHTML(source.value);
        migratePlainImages();
        normalizeLoadedImages();
    } else {
        prepareEditorImages();
    }

    function clampLinkTooltip() {
        var tooltip = mount.querySelector('.ql-tooltip');
        var container = mount.querySelector('.ql-container');
        if (!tooltip || !container || tooltip.classList.contains('ql-hidden')) {
            return;
        }

        var padding = 8;
        var maxLeft = container.offsetWidth - tooltip.offsetWidth - padding;
        var left = parseFloat(tooltip.style.left) || 0;

        if (left < padding) {
            tooltip.style.left = padding + 'px';
        } else if (left > maxLeft) {
            tooltip.style.left = Math.max(padding, maxLeft) + 'px';
        }
    }

    var tooltip = mount.querySelector('.ql-tooltip');
    if (tooltip) {
        var tooltipObserver = new MutationObserver(function () {
            requestAnimationFrame(clampLinkTooltip);
        });
        tooltipObserver.observe(tooltip, {
            attributes: true,
            attributeFilter: ['class', 'style'],
        });
    }

    quill.on('selection-change', function () {
        requestAnimationFrame(clampLinkTooltip);
    });

    var panel = mount.closest('.wysiwyg-shell');

    if (panel) {
        panel.addEventListener('dragover', function (event) {
            var hasFiles = event.dataTransfer.types && Array.prototype.indexOf.call(event.dataTransfer.types, 'Files') !== -1;
            if (!hasFiles) {
                return;
            }
            event.preventDefault();
            panel.classList.add('wysiwyg-dragover');
        });

        panel.addEventListener('dragleave', function (event) {
            if (!panel.contains(event.relatedTarget)) {
                panel.classList.remove('wysiwyg-dragover');
            }
        });

        panel.addEventListener('drop', function (event) {
            var file = event.dataTransfer.files && event.dataTransfer.files[0];
            if (!file || !file.type.startsWith('image/')) {
                event.preventDefault();
                event.stopPropagation();
                panel.classList.remove('wysiwyg-dragover');
                return;
            }

            event.preventDefault();
            panel.classList.remove('wysiwyg-dragover');
            var range = quill.getSelection(true) || { index: quill.getLength() };
            uploadImage(file)
                .then(function (url) {
                    insertThumbAt(range.index, url);
                    var thumb = editorRoot.querySelector('.wiki-thumb:last-of-type img');
                    if (thumb && imageTools) {
                        imageTools.select(thumb);
                    }
                })
                .catch(function (error) {
                    window.alert(error.message || 'Could not upload image.');
                });
        });
    }

    function syncBodyToSource() {
        if (!source || !editorRoot) {
            return;
        }
        source.value = serializeEditorHtml();
    }

    editorRoot.addEventListener('input', function () {
        syncBodyToSource();
    });

    quill.on('text-change', function () {
        syncBodyToSource();
    });

    if (form) {
        form.addEventListener('submit', function () {
            imageTools.clear();
            syncBodyToSource();
        });
    }

    var coverInput = document.getElementById('id_image');
    var coverPreview = document.getElementById('cover-image-preview');
    var coverPlaceholder = document.getElementById('cover-image-placeholder');
    var coverClearField = document.getElementById('id_clear_cover');
    var coverClear = document.getElementById('cover-image-clear');

    function showCoverPreview(file) {
        if (!coverPreview || !file) {
            return;
        }
        var reader = new FileReader();
        reader.onload = function () {
            coverPreview.src = reader.result;
            coverPreview.hidden = false;
            if (coverPlaceholder) {
                coverPlaceholder.hidden = true;
            }
            if (coverClear) {
                coverClear.hidden = false;
            }
            if (coverClearField) {
                coverClearField.checked = false;
            }
        };
        reader.readAsDataURL(file);
    }

    if (coverInput) {
        coverInput.addEventListener('change', function () {
            var file = coverInput.files && coverInput.files[0];
            if (file) {
                showCoverPreview(file);
            }
        });
    }

    if (coverPlaceholder && coverInput) {
        coverPlaceholder.addEventListener('click', function () {
            coverInput.click();
        });
        coverPlaceholder.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                coverInput.click();
            }
        });
    }

    var coverPreviewWrap = document.querySelector('.cover-image-preview-wrap');
    if (coverPreviewWrap && coverInput) {
        coverPreviewWrap.addEventListener('click', function (event) {
            if (event.target.closest('#cover-image-clear')) {
                return;
            }
            if (coverPreview && !coverPreview.hidden) {
                return;
            }
            coverInput.click();
        });
    }

    if (coverClear) {
        coverClear.addEventListener('click', function () {
            if (coverInput) {
                coverInput.value = '';
            }
            if (coverPreview) {
                coverPreview.hidden = true;
                coverPreview.removeAttribute('src');
            }
            if (coverPlaceholder) {
                coverPlaceholder.hidden = false;
            }
            coverClear.hidden = true;
            if (coverClearField) {
                coverClearField.checked = true;
            }
        });
    }
})();
