from django.shortcuts import render, get_object_or_404

from .models import Article
def home(request):
    return render(request, 'wiki/home.html')


def articles(request):
    article_list = Article.objects.order_by("creation_date")[:]
    context = {"article_list": article_list}
    return render(request, 'wiki/articles.html', context)


def article(request, article_title):
    article = get_object_or_404(Article, title=article_title)
    return render(request, 'wiki/article.html', {"article": article})


def login_page(request):
    return render(request, 'login.html')


def register_page(request):
    return render(request, 'register.html')
