select
    cast(null as text)             as run_id,
    cast(null as text)             as depot_id,
    cast(null as text)             as driver_id,
    cast(null as text)             as vehicle_plate,
    cast(null as timestamp)        as departed_at,
    cast(null as timestamp)        as returned_at,
    cast(null as timestamp)        as shift_started_at,
    cast(null as timestamp)        as shift_ended_at,
    cast(null as timestamp)        as scheduled_at,
    cast(null as double precision) as route_hours,
    cast(null as text)             as route_type
where false
