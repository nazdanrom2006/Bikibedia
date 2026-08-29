from django import forms
from django.contrib.auth.forms import AuthenticationForm, PasswordChangeForm, UserCreationForm
from django.contrib.auth.models import User
from django.utils import timezone

from .models import Profile

MIN_BIRTH_YEAR = 1900
BIRTH_DATE_INPUT_FORMATS = ['%d.%m.%Y']


class RegisterForm(UserCreationForm):
    email = forms.EmailField(label='Email')

    class Meta:
        model = User
        fields = ('username', 'email', 'password1', 'password2')
        widgets = {
            'username': forms.TextInput(attrs={'class': 'input'}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for name in ('email', 'password1', 'password2'):
            self.fields[name].widget.attrs['class'] = 'input'


class LoginForm(AuthenticationForm):
    username = forms.CharField(
        label='Username',
        widget=forms.TextInput(attrs={'class': 'input'}),
    )
    password = forms.CharField(
        label='Password',
        widget=forms.PasswordInput(attrs={'class': 'input'}),
    )


class ProfileForm(forms.ModelForm):
    username = forms.CharField(
        label='Username',
        max_length=150,
        widget=forms.TextInput(attrs={'class': 'input', 'autocomplete': 'username'}),
    )
    email = forms.EmailField(
        label='Email',
        widget=forms.EmailInput(attrs={'class': 'input', 'autocomplete': 'email'}),
    )
    avatar = forms.ImageField(
        required=False,
        label='Profile photo',
        widget=forms.FileInput(attrs={
            'class': 'profile-avatar-input',
            'accept': 'image/*',
            'id': 'id_avatar',
        }),
    )

    class Meta:
        model = Profile
        fields = ('birth_date', 'avatar')
        labels = {
            'birth_date': 'Date of birth',
        }

    def __init__(self, *args, user=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.user = user
        self.fields['birth_date'] = forms.DateField(
            required=False,
            input_formats=BIRTH_DATE_INPUT_FORMATS,
            label='Date of birth',
            widget=forms.TextInput(attrs={
                'class': 'input birth-date-input',
                'placeholder': 'DD.MM.YYYY',
                'inputmode': 'numeric',
                'maxlength': '10',
                'autocomplete': 'bday',
                'data-birth-date-input': '',
            }),
        )
        if self.instance and self.instance.birth_date:
            self.initial['birth_date'] = self.instance.birth_date.strftime('%d.%m.%Y')
        if user:
            self.fields['username'].initial = user.username
            self.fields['email'].initial = user.email

    def clean_username(self):
        username = self.cleaned_data.get('username', '').strip()
        if not username:
            raise forms.ValidationError('Username is required.')
        if self.user and User.objects.exclude(pk=self.user.pk).filter(username__iexact=username).exists():
            raise forms.ValidationError('This username is already taken.')
        return username

    def clean_birth_date(self):
        birth_date = self.cleaned_data.get('birth_date')
        if not birth_date:
            return birth_date

        today = timezone.localdate()
        if birth_date.year < MIN_BIRTH_YEAR or birth_date.year > today.year:
            raise forms.ValidationError(
                f'Enter a real date from {MIN_BIRTH_YEAR} to {today.year}.'
            )
        if birth_date > today:
            raise forms.ValidationError('Date of birth cannot be in the future.')
        return birth_date

    def save(self, commit=True):
        profile = super().save(commit=commit)
        if self.user:
            self.user.username = self.cleaned_data['username']
            self.user.email = self.cleaned_data['email']
            self.user.save(update_fields=['username', 'email'])
        return profile


class StyledPasswordChangeForm(PasswordChangeForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            field.widget.attrs.setdefault('class', 'input')
        self.fields['old_password'].widget.attrs['autocomplete'] = 'current-password'
        self.fields['new_password1'].widget.attrs['autocomplete'] = 'new-password'
        self.fields['new_password2'].widget.attrs['autocomplete'] = 'new-password'
