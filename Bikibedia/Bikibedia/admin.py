from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import Group, User

from accounts.models import Profile
from wiki.models import Article, ArticleVote

admin.site.unregister(User)
admin.site.unregister(Group)


class ProfileInline(admin.StackedInline):
    model = Profile
    can_delete = False
    extra = 0
    fields = ('avatar', 'birth_date')


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('username', 'email', 'is_staff', 'is_superuser', 'is_active', 'date_joined')
    list_filter = ('is_staff', 'is_superuser', 'is_active')
    search_fields = ('username', 'email')
    ordering = ('-date_joined',)
    inlines = (ProfileInline,)

    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Personal info', {'fields': ('email',)}),
        ('Permissions', {
            'fields': ('is_active', 'is_staff', 'is_superuser'),
            'description': (
                'Staff status gives access to this admin panel. '
                'Superuser status grants full permissions.'
            ),
        }),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
    )

    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('username', 'email', 'password1', 'password2', 'is_staff', 'is_active'),
        }),
    )

    filter_horizontal = ()


@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    list_display = ('title', 'author', 'status', 'created_at', 'updated_at')
    list_display_links = ('title',)
    list_filter = ('status', 'created_at', 'author')
    search_fields = ('title', 'slug', 'introduction', 'body_text')
    prepopulated_fields = {'slug': ('title',)}
    readonly_fields = ('created_at', 'updated_at', 'submitted_at', 'reviewed_at')
    autocomplete_fields = ('author',)
    date_hierarchy = 'created_at'
    list_per_page = 25

    fieldsets = (
        (None, {
            'fields': ('title', 'slug', 'author', 'status'),
        }),
        ('Content', {
            'fields': ('introduction', 'body_text', 'image'),
        }),
        ('Moderation', {
            'fields': ('moderator_comment', 'submitted_at', 'reviewed_by', 'reviewed_at'),
        }),
        ('Dates', {
            'fields': ('created_at', 'updated_at'),
        }),
    )


@admin.register(ArticleVote)
class ArticleVoteAdmin(admin.ModelAdmin):
    list_display = ('article', 'user', 'value', 'updated_at')
    list_filter = ('value', 'updated_at')
    search_fields = ('article__title', 'user__username')
    autocomplete_fields = ('article', 'user')
    date_hierarchy = 'updated_at'
