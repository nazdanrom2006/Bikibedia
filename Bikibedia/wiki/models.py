from django.conf import settings
from django.db import models
from django.utils.text import slugify


class PublishedArticleManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(status=Article.STATUS_PUBLISHED)


class Article(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_PUBLISHED = 'published'
    STATUS_REJECTED = 'rejected'
    STATUS_CHOICES = (
        (STATUS_PENDING, 'Pending review'),
        (STATUS_PUBLISHED, 'Published'),
        (STATUS_REJECTED, 'Rejected'),
    )

    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    introduction = models.CharField(max_length=500)
    body_text = models.TextField()
    image = models.ImageField(upload_to='articles/', blank=True)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='articles',
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
    )
    moderator_comment = models.TextField(blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_articles',
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = models.Manager()
    published = PublishedArticleManager()

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Wiki article'
        verbose_name_plural = 'Wiki articles'

    def __str__(self):
        return self.title

    @property
    def is_public(self):
        return self.status == self.STATUS_PUBLISHED

    @property
    def status_label(self):
        return dict(self.STATUS_CHOICES).get(self.status, self.status)

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.title) or 'article'
            slug = base
            counter = 1
            while Article.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f'{base}-{counter}'
                counter += 1
            self.slug = slug
        super().save(*args, **kwargs)

    def vote_score(self):
        return self.votes.aggregate(total=models.Sum('value'))['total'] or 0


class ArticleVote(models.Model):
    VALUE_LIKE = 1
    VALUE_DISLIKE = -1
    VALUE_CHOICES = (
        (VALUE_LIKE, 'Like'),
        (VALUE_DISLIKE, 'Dislike'),
    )

    article = models.ForeignKey(
        Article,
        on_delete=models.CASCADE,
        related_name='votes',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='article_votes',
    )
    value = models.SmallIntegerField(choices=VALUE_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=('article', 'user'),
                name='unique_article_vote_per_user',
            ),
        ]
        ordering = ['-updated_at']

    def __str__(self):
        label = 'like' if self.value == self.VALUE_LIKE else 'dislike'
        return f'{label} on {self.article.title} by {self.user.username}'


class ArticleRevision(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_CHOICES = (
        (STATUS_PENDING, 'Pending review'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_REJECTED, 'Rejected'),
    )

    article = models.ForeignKey(
        Article,
        on_delete=models.CASCADE,
        related_name='revisions',
    )
    title = models.CharField(max_length=200)
    introduction = models.CharField(max_length=500)
    body_text = models.TextField()
    image = models.ImageField(upload_to='articles/revisions/', blank=True)
    remove_cover = models.BooleanField(default=False)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
    )
    moderator_comment = models.TextField(blank=True)
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='article_revisions',
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_revisions',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Revision for {self.article.title}'
