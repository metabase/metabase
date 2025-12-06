# Аналитика комментариев из Google Sheets

## Примеры SQL запросов для аналитики

### 1. Статистика по темам
```sql
SELECT 
  topic AS "Тема",
  COUNT(*) AS "Количество обращений",
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) AS "Доля, %",
  SUM(CASE WHEN has_response = true THEN 1 ELSE 0 END) AS "С ответом",
  ROUND(SUM(CASE WHEN has_response = true THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS "Процент ответов, %"
FROM comments
GROUP BY topic
ORDER BY COUNT(*) DESC
```

### 2. Динамика обращений по месяцам
```sql
SELECT 
  DATE_TRUNC('month', date) AS "Месяц",
  COUNT(*) AS "Количество обращений",
  SUM(CASE WHEN has_response = true THEN 1 ELSE 0 END) AS "С ответом",
  SUM(CASE WHEN has_response = false THEN 1 ELSE 0 END) AS "Без ответа"
FROM comments
GROUP BY DATE_TRUNC('month', date)
ORDER BY DATE_TRUNC('month', date) DESC
```

### 3. Топ авторов по активности
```sql
SELECT 
  author AS "Автор",
  COUNT(*) AS "Количество обращений",
  COUNT(DISTINCT topic) AS "Количество тем",
  MIN(date) AS "Первое обращение",
  MAX(date) AS "Последнее обращение",
  ROUND(AVG(CASE WHEN has_response = true THEN 1 ELSE 0 END) * 100, 2) AS "Процент ответов, %"
FROM comments
GROUP BY author
HAVING COUNT(*) >= 5
ORDER BY COUNT(*) DESC
```

### 4. Распределение по районам
```sql
SELECT 
  district AS "Район",
  COUNT(*) AS "Количество обращений",
  COUNT(DISTINCT settlement) AS "Количество населенных пунктов",
  COUNT(DISTINCT topic) AS "Количество тем",
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) AS "Доля, %"
FROM comments
WHERE district IS NOT NULL AND district != ''
GROUP BY district
ORDER BY COUNT(*) DESC
```

### 5. Анализ времени ответа (если есть данные о времени ответа)
```sql
SELECT 
  topic AS "Тема",
  AVG(DATEDIFF('day', date, response_date)) AS "Среднее время ответа (дни)",
  MIN(DATEDIFF('day', date, response_date)) AS "Минимальное время ответа",
  MAX(DATEDIFF('day', date, response_date)) AS "Максимальное время ответа",
  COUNT(*) AS "Количество обращений с ответом"
FROM comments
WHERE has_response = true AND response_date IS NOT NULL
GROUP BY topic
ORDER BY AVG(DATEDIFF('day', date, response_date)) DESC
```

### 6. Популярные темы по районам
```sql
SELECT 
  district AS "Район",
  topic AS "Тема",
  COUNT(*) AS "Количество обращений",
  ROW_NUMBER() OVER(PARTITION BY district ORDER BY COUNT(*) DESC) AS "Ранг в районе"
FROM comments
WHERE district IS NOT NULL AND district != ''
GROUP BY district, topic
QUALIFY ROW_NUMBER() OVER(PARTITION BY district ORDER BY COUNT(*) DESC) <= 5
ORDER BY district, COUNT(*) DESC
```

### 7. Сезонность обращений
```sql
SELECT 
  EXTRACT(MONTH FROM date) AS "Месяц",
  EXTRACT(YEAR FROM date) AS "Год",
  COUNT(*) AS "Количество обращений",
  COUNT(DISTINCT topic) AS "Количество тем",
  COUNT(DISTINCT author) AS "Количество авторов"
FROM comments
GROUP BY EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date)
ORDER BY EXTRACT(YEAR FROM date) DESC, EXTRACT(MONTH FROM date) DESC
```

### 8. Анализ текстов обращений (длина, ключевые слова)
```sql
SELECT 
  CASE 
    WHEN LENGTH(text) < 100 THEN 'Короткое (<100)'
    WHEN LENGTH(text) < 500 THEN 'Среднее (100-500)'
    ELSE 'Длинное (>500)'
  END AS "Длина текста",
  COUNT(*) AS "Количество обращений",
  ROUND(AVG(CASE WHEN has_response = true THEN 1 ELSE 0 END) * 100, 2) AS "Процент ответов, %",
  ROUND(AVG(LENGTH(text)), 2) AS "Средняя длина текста"
FROM comments
GROUP BY CASE 
    WHEN LENGTH(text) < 100 THEN 'Короткое (<100)'
    WHEN LENGTH(text) < 500 THEN 'Среднее (100-500)'
    ELSE 'Длинное (>500)'
  END
ORDER BY COUNT(*) DESC
```

## Примеры дашбордов

### Дашборд 1: Общая статистика
1. **Карточки метрик:**
   - Всего обращений
   - Обращений с ответом
   - Процент ответов
   - Уникальных авторов
   - Уникальных тем

2. **Графики:**
   - Динамика обращений по месяцам (линейный график)
   - Распределение по темам (столбчатая диаграмма)
   - Распределение по районам (карта или круговая диаграмма)

### Дашборд 2: Детальный анализ
1. **Таблица:** Все обращения с фильтрами и поиском
2. **Графики:**
   - Топ-10 авторов по активности
   - Топ-10 тем по популярности
   - Время ответа по темам
   - Сезонность обращений

### Дашборд 3: Аналитика эффективности
1. **Метрики:**
   - Среднее время ответа
   - Процент ответов по темам
   - Процент ответов по районам
   - Процент ответов по авторам

2. **Графики:**
   - Тепловая карта: темы vs районы
   - График эффективности ответов
   - Тренды по времени ответа

## Настройка в Metabase

### 1. Создание вопросов (Questions)
Для каждого SQL запроса создайте отдельный вопрос:
- Название: "Статистика по темам"
- База данных: Google Sheets
- Тип: Native query
- Вставьте соответствующий SQL

### 2. Создание дашбордов (Dashboards)
1. **Общий дашборд:**
   - Добавьте карточки метрик
   - Добавьте графики динамики
   - Добавьте фильтры по дате, теме, району

2. **Детальный дашборд:**
   - Используйте кастомную визуализацию CommentsDashboard
   - Добавьте фильтры для детального анализа
   - Добавьте связанные графики

### 3. Настройка фильтров
- **Дата:** Диапазон дат
- **Тема:** Выпадающий список
- **Район:** Выпадающий список
- **Автор:** Выпадающий список
- **Наличие ответа:** Переключатель

### 4. Автоматизация
- Настройте периодическую синхронизацию с Google Sheets
- Настройте алерты при превышении порогов
- Настройте автоматические отчеты по email

## Интеграция с внешними системами

### API эндпоинты
```
GET /api/comments/stats - общая статистика
GET /api/comments/search - поиск с фильтрами
GET /api/comments/analytics - аналитика
POST /api/comments/sync - принудительная синхронизация
```

### Webhooks
- Уведомления о новых обращениях
- Уведомления об ответах
- Уведомления о превышении порогов

## Оптимизация производительности

1. **Кэширование:**
   - Redis для быстрого доступа
   - Кэширование агрегированных данных
   - Индексация по часто используемым полям

2. **Ленивая загрузка:**
   - Постраничная загрузка данных
   - Ленивая загрузка графиков
   - Оптимизированные запросы

3. **Мониторинг:**
   - Мониторинг времени ответа API
   - Мониторинг использования памяти
   - Мониторинг синхронизации