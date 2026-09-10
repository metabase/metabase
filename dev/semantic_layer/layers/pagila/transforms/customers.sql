-- One row per customer, with where they live, their home store, and their lifetime rental history.
SELECT
  c.customer_id,
  c.first_name || ' ' || c.last_name         AS customer_name,
  c.email,
  c.activebool                               AS is_active,
  c.create_date                              AS customer_since,
  c.store_id,
  sc.city                                    AS store_city,
  a.district,
  ci.city,
  co.country,
  COALESCE(st.rental_count, 0)               AS rental_count,
  COALESCE(st.total_spent, 0)                AS total_spent,
  st.first_rental_date,
  st.last_rental_date,
  COALESCE(st.late_returns, 0)               AS late_returns,
  fav.category                               AS favorite_category
FROM pagila.customer c
LEFT JOIN pagila.address a   ON a.address_id = c.address_id
LEFT JOIN pagila.city ci     ON ci.city_id = a.city_id
LEFT JOIN pagila.country co  ON co.country_id = ci.country_id
LEFT JOIN pagila.store s     ON s.store_id = c.store_id
LEFT JOIN pagila.address sa  ON sa.address_id = s.address_id
LEFT JOIN pagila.city sc     ON sc.city_id = sa.city_id
LEFT JOIN (
  SELECT r.customer_id,
         COUNT(DISTINCT r.rental_id)::int AS rental_count,
         SUM(p.amount)                    AS total_spent,
         MIN(r.rental_date)               AS first_rental_date,
         MAX(r.rental_date)               AS last_rental_date,
         COUNT(DISTINCT r.rental_id) FILTER (
           WHERE r.return_date IS NOT NULL
             AND (r.return_date - r.rental_date) > make_interval(days => f.rental_duration))::int AS late_returns
  FROM pagila.rental r
  JOIN pagila.inventory i    ON i.inventory_id = r.inventory_id
  JOIN pagila.film f         ON f.film_id = i.film_id
  LEFT JOIN pagila.payment p ON p.rental_id = r.rental_id
  GROUP BY r.customer_id
) st ON st.customer_id = c.customer_id
LEFT JOIN LATERAL (
  SELECT cat.name AS category
  FROM pagila.rental r
  JOIN pagila.inventory i        ON i.inventory_id = r.inventory_id
  JOIN pagila.film_category fc   ON fc.film_id = i.film_id
  JOIN pagila.category cat       ON cat.category_id = fc.category_id
  WHERE r.customer_id = c.customer_id
  GROUP BY cat.name
  ORDER BY COUNT(*) DESC, cat.name
  LIMIT 1
) fav ON TRUE
