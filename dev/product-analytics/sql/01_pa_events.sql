CREATE DATABASE IF NOT EXISTS product_analytics;

-- Copied from harbormaster's ClickHouse PA DDL (resources/harbormaster/clickhouse-pa/pa_events.sql),
-- which is what Cloud provisions. Keep this identical so a swap to real Track data stays possible.
CREATE TABLE IF NOT EXISTS product_analytics.pa_events
(
    event_id        UUID                   DEFAULT generateUUIDv4(),
    website_id      String,
    session_id      String,
    visit_id        String,
    event_type      UInt8                  DEFAULT 1,
    event_name      Nullable(String),
    tag             Nullable(String),
    url_path        String,
    url_query       Nullable(String),
    page_title      Nullable(String),
    hostname        Nullable(String),
    referrer_domain Nullable(String),
    referrer_path   Nullable(String),
    referrer_query  Nullable(String),
    utm_source      Nullable(String),
    utm_medium      Nullable(String),
    utm_campaign    Nullable(String),
    utm_content     Nullable(String),
    utm_term        Nullable(String),
    gclid           Nullable(String),
    fbclid          Nullable(String),
    msclkid         Nullable(String),
    ttclid          Nullable(String),
    li_fat_id       Nullable(String),
    twclid          Nullable(String),
    browser         Nullable(String),
    os              Nullable(String),
    device          Nullable(String),
    screen_width    Nullable(UInt16),
    screen_height   Nullable(UInt16),
    language        Nullable(String),
    country         LowCardinality(String) DEFAULT '',
    region          Nullable(String),
    city            Nullable(String),
    ip              Nullable(String),
    user_agent      Nullable(String),
    distinct_id     Nullable(String),
    visitor_id      Nullable(String),
    created_at      DateTime               DEFAULT now(),
    event_data      Map(String, String)    DEFAULT map()
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (event_type, toDate(created_at), event_id)
SETTINGS index_granularity = 8192;
