UPDATE cache_config
   SET config = json_object(
           'multiplier', coalesce((select cast(ceil(cast(`value` as decimal(10,1))) as unsigned) from setting where `key` = 'query-caching-ttl-ratio'), 10),
           'min_duration_ms', coalesce((select cast(ceil(cast(`value` as decimal(10,1))) as unsigned) from setting where `key` = 'query-caching-min-ttl'), 60000)
         )
 WHERE model = 'root' AND
       model_id = 0 AND
       strategy = 'ttl' AND
       (json_extract(config, '$.multiplier') = 0 OR
        json_extract(config, '$.min_duration_ms') = 0);
