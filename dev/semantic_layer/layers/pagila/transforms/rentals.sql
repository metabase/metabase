-- One row per rental, with the film, customer, store and payment context copied in.
SELECT
  r.rental_id,
  r.rental_date,
  r.return_date,
  (r.return_date IS NOT NULL)                                                    AS is_returned,
  ROUND(EXTRACT(EPOCH FROM (r.return_date - r.rental_date)) / 86400.0, 2)        AS rental_days,
  f.rental_duration                                                              AS allowed_days,
  CASE WHEN r.return_date IS NULL THEN NULL
       ELSE (r.return_date - r.rental_date) > make_interval(days => f.rental_duration) END AS is_late,
  CASE WHEN r.return_date IS NULL THEN NULL
       ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (r.return_date - r.rental_date)) / 86400.0) - f.rental_duration)::int END AS days_late,
  p.amount_paid,
  p.payment_date,
  r.customer_id,
  c.first_name || ' ' || c.last_name                                             AS customer_name,
  cc.city                                                                        AS customer_city,
  cco.country                                                                    AS customer_country,
  c.activebool                                                                   AS customer_is_active,
  r.staff_id,
  s.first_name || ' ' || s.last_name                                             AS staff_name,
  i.store_id,
  sc.city                                                                        AS store_city,
  i.inventory_id,
  f.film_id,
  f.title                                                                        AS film_title,
  f.rating::text                                                                 AS film_rating,
  cat.name                                                                       AS film_category,
  l.name                                                                         AS film_language,
  f.release_year                                                                 AS film_release_year,
  f.length                                                                       AS film_length_minutes,
  f.rental_rate,
  f.replacement_cost
FROM pagila.rental r
JOIN pagila.inventory i        ON i.inventory_id = r.inventory_id
JOIN pagila.film f             ON f.film_id = i.film_id
LEFT JOIN pagila.film_category fc ON fc.film_id = f.film_id
LEFT JOIN pagila.category cat  ON cat.category_id = fc.category_id
LEFT JOIN pagila.language l    ON l.language_id = f.language_id
JOIN pagila.customer c         ON c.customer_id = r.customer_id
LEFT JOIN pagila.address ca    ON ca.address_id = c.address_id
LEFT JOIN pagila.city cc       ON cc.city_id = ca.city_id
LEFT JOIN pagila.country cco   ON cco.country_id = cc.country_id
JOIN pagila.staff s            ON s.staff_id = r.staff_id
JOIN pagila.store st           ON st.store_id = i.store_id
LEFT JOIN pagila.address sa    ON sa.address_id = st.address_id
LEFT JOIN pagila.city sc       ON sc.city_id = sa.city_id
LEFT JOIN (
  SELECT rental_id, SUM(amount) AS amount_paid, MIN(payment_date) AS payment_date
  FROM pagila.payment
  GROUP BY rental_id
) p ON p.rental_id = r.rental_id
