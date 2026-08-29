from django.contrib.auth import login, update_session_auth_hash
from django.contrib.auth.decorators import login_required
from django.contrib.auth.views import LoginView, LogoutView
from django.contrib import messages
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse_lazy
from django.views.decorators.http import require_POST

from wiki.models import Article

from .forms import LoginForm, ProfileForm, RegisterForm, StyledPasswordChangeForm
from .models import Notification, Profile
from .presence import mark_profile_offline, touch_profile_last_seen


class UserLoginView(LoginView):
    template_name = 'accounts/login.html'
    authentication_form = LoginForm
    redirect_authenticated_user = True

    def form_valid(self, form):
        response = super().form_valid(form)
        touch_profile_last_seen(self.request.user)
        return response


class UserLogoutView(LogoutView):
    next_page = reverse_lazy('home')

    def dispatch(self, request, *args, **kwargs):
        if request.user.is_authenticated:
            mark_profile_offline(request.user)
        return super().dispatch(request, *args, **kwargs)


def register_view(request):
    if request.user.is_authenticated:
        return redirect('profile')

    form = RegisterForm(request.POST or None)
    if request.method == 'POST' and form.is_valid():
        user = form.save()
        login(request, user)
        touch_profile_last_seen(user)
        return redirect('profile')

    return render(request, 'accounts/register.html', {'form': form})


def get_user_profile(user):
    profile, _ = Profile.objects.get_or_create(user=user)
    return profile


@login_required
def profile_view(request):
    profile = get_user_profile(request.user)
    editing = request.GET.get('edit') == '1'

    if request.method == 'POST':
        form = ProfileForm(
            request.POST,
            request.FILES,
            instance=profile,
            user=request.user,
        )
        if form.is_valid():
            form.save()
            messages.success(request, 'Profile updated.')
            return redirect('profile')
        editing = True
    elif editing:
        form = ProfileForm(instance=profile, user=request.user)
    else:
        form = None

    articles = Article.objects.filter(author=request.user).order_by('-created_at')
    return render(request, 'accounts/profile.html', {
        'user_articles': articles,
        'profile': profile,
        'form': form,
        'editing': editing,
    })


@login_required
@require_POST
def presence_ping(request):
    touch_profile_last_seen(request.user)
    return JsonResponse({'status': 'active'})


@login_required
def change_password_view(request):
    form = StyledPasswordChangeForm(request.user, request.POST or None)
    if request.method == 'POST' and form.is_valid():
        user = form.save()
        update_session_auth_hash(request, user)
        messages.success(request, 'Password updated successfully.')
        return redirect('profile')

    return render(request, 'accounts/change_password.html', {
        'form': form,
    })


@login_required
def notifications_view(request):
    notifications = Notification.objects.filter(user=request.user).select_related('article')
    return render(request, 'accounts/notifications.html', {
        'notifications': notifications,
    })


@login_required
@require_POST
def notification_mark_read(request, pk):
    notification = get_object_or_404(Notification, pk=pk, user=request.user)
    notification.is_read = True
    notification.save(update_fields=['is_read'])
    if notification.link:
        return redirect(notification.link)
    return redirect('notifications')


@login_required
@require_POST
def notification_delete(request, pk):
    notification = get_object_or_404(Notification, pk=pk, user=request.user)
    notification.delete()
    messages.success(request, 'Notification deleted.')
    return redirect('notifications')


@login_required
@require_POST
def notifications_mark_all_read(request):
    Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
    messages.success(request, 'All notifications marked as read.')
    return redirect('notifications')


@login_required
@require_POST
def notifications_delete_all(request):
    Notification.objects.filter(user=request.user).delete()
    messages.success(request, 'All notifications deleted.')
    return redirect('notifications')

