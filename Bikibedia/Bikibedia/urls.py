from django.contrib import admin
from django.urls import path

from wiki import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', views.home, name='home'),
    path('articles/', views.articles, name='articles'),
    path('wiki/<str:article_title>', views.article, name='article'),
    path('login/', views.login_page, name='login'),
    path('register/', views.register_page, name='register'),
]
