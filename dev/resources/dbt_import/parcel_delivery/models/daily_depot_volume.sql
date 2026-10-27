select
    cast(null as text)             as depot_day_id,
    cast(null as date)             as volume_date,
    cast(null as text)             as carrier,
    cast(null as boolean)          as is_weekend,
    cast(null as boolean)          as is_holiday,
    cast(null as integer)          as zone_number,
    cast(null as text)             as region,
    cast(null as text)             as depot_type,
    cast(null as text)             as service_level,
    cast(null as integer)          as parcels_received,
    cast(null as integer)          as parcels_delayed,
    cast(null as integer)          as parcels_damaged
where false
