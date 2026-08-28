from django.shortcuts import render


def home(request):
    return render(request, 'wiki/home.html')


def articles(request):
    return render(request, 'wiki/articles.html')


def example_article(request):
    return render(request, 'wiki/article.html')


def login_page(request):
    return render(request, 'login.html')


def register_page(request):
    return render(request, 'register.html')
