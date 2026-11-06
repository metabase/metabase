-- Run after generate.ts has loaded pa_identities.
-- One row per identified person, for Metabase. A plain table like
-- pa_events_resolved, for the same reasons.
--
-- person_id is pa_identities.session_id, which Track fills with the id passed
-- to identify(). It matches pa_events_resolved.person_id for every identified
-- person, so in Metabase mark pa_identities_resolved.person_id as the primary
-- key and pa_events_resolved.person_id as a foreign key to it (see README).
-- Never-identified visitors have events but no identity row.
--
-- These are current traits. Splitting events by them applies a later state
-- to earlier events; pa_events_resolved.person_* are the traits as of each event.
--
-- FINAL collapses ReplacingMergeTree(created_at) to the latest identify() per
-- person. Traits are promoted out of identity_data so the prototype does not
-- need map access in MBQL.

DROP TABLE IF EXISTS product_analytics.pa_identities_resolved;

CREATE TABLE product_analytics.pa_identities_resolved
ENGINE = MergeTree()
ORDER BY (person_id)
AS
SELECT
    session_id                          AS person_id,
    website_id,
    identity_data['email']              AS email,
    identity_data['name']               AS name,
    identity_data['company']            AS company,
    identity_data['role']               AS role,
    identity_data['plan']               AS plan,
    nullIf(identity_data['billing_cycle'], '') AS billing_cycle,
    parseDateTimeBestEffortOrNull(identity_data['signed_up_at']) AS signed_up_at,
    created_at                          AS identified_at,
    identity_data
FROM product_analytics.pa_identities FINAL;
