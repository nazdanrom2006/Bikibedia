from django.db import models

# Create your models here.
class Article(models.Model):
    title = models.CharField(max_length=50)
    introduction = models.CharField(max_length=500)
    body_text = models.CharField()
    image = models.ImageField()
    creation_date = models.DateTimeField()
    def __str__(self):
        return self.title
