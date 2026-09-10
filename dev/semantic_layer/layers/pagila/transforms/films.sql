-- One row per film in the catalogue, with its category, language, extras and lifetime rental stats.
SELECT
  f.film_id,
  f.title,
  f.description,
  f.release_year,
  f.rating::text                                         AS rating,
  cat.name                                               AS category,
  l.name                                                 AS language,
  f.length                                               AS length_minutes,
  f.rental_duration                                      AS allowed_days,
  f.rental_rate,
  f.replacement_cost,
  'Trailers'           = ANY(f.special_features)         AS has_trailers,
  'Commentaries'       = ANY(f.special_features)         AS has_commentaries,
  'Deleted Scenes'     = ANY(f.special_features)         AS has_deleted_scenes,
  'Behind the Scenes'  = ANY(f.special_features)         AS has_behind_the_scenes,
  (SELECT COUNT(*) FROM pagila.film_actor fa WHERE fa.film_id = f.film_id)::int AS actor_count,
  (SELECT COUNT(*) FROM pagila.inventory i WHERE i.film_id = f.film_id)::int    AS copies_in_stock,
  COALESCE(st.rental_count, 0)                           AS rental_count,
  COALESCE(st.revenue, 0)                                AS revenue,
  st.first_rented_at,
  st.last_rented_at
FROM pagila.film f
LEFT JOIN pagila.film_category fc ON fc.film_id = f.film_id
LEFT JOIN pagila.category cat     ON cat.category_id = fc.category_id
LEFT JOIN pagila.language l       ON l.language_id = f.language_id
LEFT JOIN (
  SELECT i.film_id,
         COUNT(DISTINCT r.rental_id)::int AS rental_count,
         SUM(p.amount)                    AS revenue,
         MIN(r.rental_date)               AS first_rented_at,
         MAX(r.rental_date)               AS last_rented_at
  FROM pagila.inventory i
  JOIN pagila.rental r          ON r.inventory_id = i.inventory_id
  LEFT JOIN pagila.payment p    ON p.rental_id = r.rental_id
  GROUP BY i.film_id
) st ON st.film_id = f.film_id
