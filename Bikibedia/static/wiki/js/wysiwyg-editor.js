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
    var editorContainer = null;
    var editorRoot = null;

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

    var quill = new Quill(mount, {
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
                                    quill.insertEmbed(range.index, 'image', url, 'user');
                                    quill.setSelection(range.index + 1);
                                    prepareEditorImages();
                                    var imgs = editorRoot.querySelectorAll('img');
                                    if (imgs.length && imageResize) {
                                        imageResize.select(imgs[imgs.length - 1]);
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
    }

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

    var imageResize = (function createImageResize() {
        var activeImg = null;
        var overlay = null;
        var frame = null;
        var handle = null;
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
        editorContainer.appendChild(overlay);

        function clampSize(value, min, max) {
            return Math.max(min, Math.min(max, value));
        }

        function editorMaxWidth() {
            return editorRoot.clientWidth - 16;
        }

        function syncOverlay() {
            if (!activeImg || overlay.hidden || !editorContainer) {
                return;
            }

            var containerRect = editorContainer.getBoundingClientRect();
            var imgRect = activeImg.getBoundingClientRect();

            overlay.style.left = (imgRect.left - containerRect.left) + 'px';
            overlay.style.top = (imgRect.top - containerRect.top) + 'px';
            overlay.style.width = imgRect.width + 'px';
            overlay.style.height = imgRect.height + 'px';
        }

        function clearSelection() {
            activeImg = null;
            overlay.hidden = true;
            editorRoot.querySelectorAll('img.is-selected').forEach(function (img) {
                img.classList.remove('is-selected');
            });
        }

        function select(img) {
            if (!img || img.tagName !== 'IMG') {
                return;
            }

            activeImg = img;
            editorRoot.querySelectorAll('img.is-selected').forEach(function (node) {
                node.classList.remove('is-selected');
            });
            img.classList.add('is-selected');
            overlay.hidden = false;
            syncOverlay();
        }

        function applySize(width, height) {
            if (!activeImg) {
                return;
            }

            var maxWidth = editorMaxWidth();
            width = clampSize(Math.round(width), MIN_IMAGE_SIZE, maxWidth);
            height = clampSize(Math.round(height), MIN_IMAGE_SIZE, 1200);

            activeImg.style.width = '';
            activeImg.style.height = '';
            activeImg.style.maxWidth = '';
            activeImg.setAttribute('width', String(width));
            activeImg.setAttribute('height', String(height));
            syncOverlay();
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
            var width = dragState.startWidth;
            var height = dragState.startHeight;

            if (dragState.mode === 'corner') {
                width = dragState.startWidth + deltaX;
                height = dragState.startHeight + deltaY;
            }

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
        }

        function bindHandle(node, mode) {
            node.addEventListener('pointerdown', function (event) {
                startDrag(mode, event);
            });
            node.addEventListener('pointermove', function (event) {
                if (dragState && dragState.mode === mode) {
                    onDrag(event);
                }
            });
            node.addEventListener('pointerup', stopDrag);
            node.addEventListener('pointercancel', stopDrag);
        }

        bindHandle(handle, 'corner');

        overlay.addEventListener('mousedown', function (event) {
            event.preventDefault();
            event.stopPropagation();
        });

        editorRoot.addEventListener('click', function (event) {
            if (dragState) {
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
            if ((event.key === 'Delete' || event.key === 'Backspace') && overlay.contains(document.activeElement) === false) {
                var blot = Quill.find(activeImg);
                if (blot) {
                    blot.remove();
                } else {
                    activeImg.remove();
                }
                clearSelection();
                event.preventDefault();
            }
        });

        return {
            select: select,
            clear: clearSelection,
            sync: syncOverlay,
        };
    })();

    function normalizeLoadedImages() {
        editorRoot.querySelectorAll('img').forEach(function (img) {
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
            img.style.width = '';
            img.style.height = '';
            img.style.maxWidth = '';
        });
        prepareEditorImages();
    }

    if (source.value.trim()) {
        quill.clipboard.dangerouslyPasteHTML(source.value);
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
                    quill.insertEmbed(range.index, 'image', url, 'user');
                    quill.setSelection(range.index + 1);
                    prepareEditorImages();
                    var imgs = editorRoot.querySelectorAll('img');
                    if (imgs.length && imageResize) {
                        imageResize.select(imgs[imgs.length - 1]);
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
        var html = editorRoot.innerHTML.trim();
        if (html === '<p><br></p>') {
            html = '';
        }
        source.value = html;
    }

    quill.on('text-change', function () {
        syncBodyToSource();
    });

    if (form) {
        form.addEventListener('submit', function () {
            imageResize.clear();
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
