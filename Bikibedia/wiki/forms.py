from django import forms

from .models import Article
from .sanitize import sanitize_article_html


class ArticleForm(forms.ModelForm):
    clear_cover = forms.BooleanField(required=False, widget=forms.HiddenInput())

    class Meta:
        model = Article
        fields = ('title', 'introduction', 'body_text', 'image')
        widgets = {
            'title': forms.TextInput(attrs={'class': 'input'}),
            'introduction': forms.Textarea(attrs={'rows': 2, 'class': 'input input-compact'}),
            'body_text': forms.Textarea(attrs={
                'class': 'wysiwyg-source',
                'data-wysiwyg-source': '',
            }),
            'image': forms.FileInput(attrs={
                'class': 'input-file cover-image-input',
                'accept': 'image/*',
            }),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['body_text'].required = False
        self.fields['body_text'].widget.is_required = False

    def clean_body_text(self):
        body = self.cleaned_data.get('body_text', '')
        cleaned = sanitize_article_html(body).strip()
        if cleaned in ('', '<p></p>', '<p><br></p>'):
            raise forms.ValidationError('Add article text or at least one photo.')
        return cleaned

    def save(self, commit=True):
        instance = super().save(commit=False)
        if self.cleaned_data.get('clear_cover') and not self.cleaned_data.get('image'):
            instance.image = None
        if commit:
            instance.save()
        return instance


class ModerationDecisionForm(forms.Form):
    comment = forms.CharField(
        label='Comment for the author',
        required=False,
        widget=forms.Textarea(attrs={
            'class': 'input',
            'rows': 4,
            'placeholder': 'Explain what should be fixed, or leave empty when approving.',
        }),
    )
