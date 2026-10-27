select
    cast(null as text)      as depot_id,
    cast(null as text)      as parcel_id,
    cast(null as integer)   as revision,
    cast(null as jsonb)     as scan_events,
    cast(null as boolean)   as is_fragile,
    cast(null as boolean)   as is_oversized,
    cast(null as boolean)   as requires_signature,
    cast(null as boolean)   as is_returned,
    cast(null as boolean)   as is_insured,
    cast(null as timestamp) as created_at,
    cast(null as timestamp) as last_scanned_at,
    cast(null as timestamp) as next_scan_due_at,
    cast(null as boolean)   as is_delivered
where false
