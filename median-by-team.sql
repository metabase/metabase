SELECT feature_cluster,
       count(*),
       extract(days from avg(time_to_close)) as days_to_close
FROM time_to_close_bugs
GROUP BY feature_cluster
