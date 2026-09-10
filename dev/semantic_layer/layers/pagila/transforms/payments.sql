-- One row per payment, with who paid, which store took it, and what was rented.
SELECT
  p.payment_id,
  p.payment_date,
  p.amount,
  p.customer_id,
  c.first_name || ' ' || c.last_name   AS customer_name,
  cco.country                          AS customer_country,
  p.staff_id,
  s.first_name || ' ' || s.last_name   AS staff_name,
  s.store_id,
  sc.city                              AS store_city,
  p.rental_id,
  r.rental_date,
  i.film_id,
  f.title                              AS film_title,
  f.rating::text                       AS film_rating,
  cat.name                             AS film_category
FROM pagila.payment p
JOIN pagila.customer c            ON c.customer_id = p.customer_id
LEFT JOIN pagila.address ca       ON ca.address_id = c.address_id
LEFT JOIN pagila.city cc          ON cc.city_id = ca.city_id
LEFT JOIN pagila.country cco      ON cco.country_id = cc.country_id
JOIN pagila.staff s               ON s.staff_id = p.staff_id
JOIN pagila.store st              ON st.store_id = s.store_id
LEFT JOIN pagila.address sa       ON sa.address_id = st.address_id
LEFT JOIN pagila.city sc          ON sc.city_id = sa.city_id
LEFT JOIN pagila.rental r         ON r.rental_id = p.rental_id
LEFT JOIN pagila.inventory i      ON i.inventory_id = r.inventory_id
LEFT JOIN pagila.film f           ON f.film_id = i.film_id
LEFT JOIN pagila.film_category fc ON fc.film_id = f.film_id
LEFT JOIN pagila.category cat     ON cat.category_id = fc.category_id
