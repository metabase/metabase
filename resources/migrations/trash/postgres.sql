-- DASHBOARDS
-- Next: set `archived_directly`.
UPDATE report_dashboard
SET archived_directly = COALESCE(
  -- If the collection the dashboard is in is archived, then it was *not* archived directly
  (SELECT NOT archived FROM collection WHERE id = collection_id),
  false
  )
WHERE archived = true;

-- CARDS
-- Set `archived_directly`.
UPDATE report_card
SET archived_directly = COALESCE(
  -- If the collection the card is in is archived, then it was *not* archived directly
  (SELECT NOT archived FROM collection WHERE id = collection_id),
  false
  )
WHERE archived = true;

-- COLLECTIONS
-- Set `collection.archived_directly`.
WITH CollectionWithParentID AS (
  SELECT
  id,
  archived,
  CASE
      WHEN location = '/' THEN NULL
      ELSE RIGHT(TRIM(TRAILING '/' FROM location), POSITION('/' IN REVERSE(TRIM(TRAILING '/' FROM location))) - 1)::INTEGER
  END AS parent_id
  FROM
  collection
)

UPDATE collection c
SET archived_directly = (
  cp.parent_id IS NULL
  OR NOT EXISTS (
    SELECT 1
    FROM CollectionWithParentID pp
    WHERE pp.id = cp.parent_id
    AND pp.archived = true
  )
)
FROM CollectionWithParentID cp
WHERE c.id = cp.id
AND cp.archived = true;

-- Set `collection.archive_operation_id` for collections that were archived directly

UPDATE collection
SET archive_operation_id =
CASE
    WHEN LENGTH(id::text) <= 12 THEN
        CONCAT('00000000-0000-0000-0000-', LPAD(id::text, 12, '0'))
    WHEN LENGTH(id::text) > 12 AND LENGTH(id::text) <= 16 THEN
        CONCAT('00000000-0000-0000-',
               LPAD(SUBSTRING(id::text, 1, LENGTH(id::text) - 12), 4, '0'), '-',
               SUBSTRING(id::text, LENGTH(id::text) - 11, 12))
    WHEN LENGTH(id::text) > 16 AND LENGTH(id::text) <= 20 THEN
        CONCAT('00000000-0000-',
               LPAD(SUBSTRING(id::text, 1, 4), 4, '0'), '-',
               LPAD(SUBSTRING(id::text, 5, 4), 4, '0'), '-',
               SUBSTRING(id::text, 9))
    WHEN LENGTH(id::text) > 20 THEN
        CONCAT(
               LPAD(SUBSTRING(id::text, 1, 8), 8, '0'), '-',
               LPAD(SUBSTRING(id::text, 9, 4), 4, '0'), '-',
               LPAD(SUBSTRING(id::text, 13, 4), 4, '0'), '-',
               LPAD(SUBSTRING(id::text, 17, 12), 12, '0')
        )
    -- If someone has >10^20 collections, they have bigger problems than a wrong `archive_operation_id`
    ELSE '00000000-0000-0000-0000-000000000000'
END
WHERE archived AND archived_directly;

-- Set `collection.archive_operation_id` for descendants of collections that were archived directly
WITH Ancestors(id, archived, archived_directly, archive_operation_id, location) AS (
    SELECT
    id,
    archived,
    archived_directly,
    archive_operation_id,
    location
  FROM
    collection
  WHERE
    archived_directly = true
    AND archived = true
)
UPDATE collection
SET archive_operation_id = (
  SELECT a.archive_operation_id
  FROM Ancestors a
  WHERE collection.location LIKE concat(a.location, a.id, '/%')
  ORDER BY LENGTH(a.location) DESC
  LIMIT 1
), archived_directly = false
WHERE archive_operation_id IS NULL AND archived = true;
