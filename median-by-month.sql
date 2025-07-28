SELECT DATE_TRUNC('month', created_at) AS created_at,
       count(*) as count,
       extract(days from avg(time_to_close)) as days_to_close
FROM time_to_close_bugs
GROUP BY DATE_TRUNC('month', created_at)
