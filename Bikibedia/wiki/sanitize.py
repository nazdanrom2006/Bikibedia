import bleach

ALLOWED_TAGS = [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del',
    'h2', 'h3', 'ul', 'ol', 'li', 'blockquote',
    'a', 'img', 'code', 'pre', 'span', 'div',
]

ALLOWED_ATTRIBUTES = {
    '*': ['class'],
    'a': ['href', 'title', 'rel', 'target'],
    'img': ['src', 'alt', 'title', 'width', 'height'],
    'div': ['class'],
    'p': ['class', 'data-placeholder'],
}

ALLOWED_PROTOCOLS = ['http', 'https', 'mailto']


def sanitize_article_html(html):
    if not html:
        return ''
    cleaned = bleach.clean(
        html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,
    )
    return bleach.linkify(
        cleaned,
        callbacks=[bleach.callbacks.nofollow],
        parse_email=True,
    )
