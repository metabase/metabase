-- DASHBOARDS
-- First: remove any dashboards whose *old parent collection* was deleted.
DELETE FROM report_dashboard
  WHERE trashed_from_collection_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM collection WHERE id = trashed_from_collection_id
);

-- Next: set `trashed_directly`.
UPDATE report_dashboard
SET trashed_directly = COALESCE(
  -- If the dashboard's current `collection_id` is the trash collection, then it was trashed directly
  collection_id = (SELECT id FROM collection WHERE type = 'trash'),
  false
  )
WHERE archived = true;

-- Set `collection_id` and `trashed_from_collection_id`
UPDATE report_dashboard
SET collection_id = trashed_from_collection_id, trashed_from_collection_id = NULL
WHERE archived = true;

-- CARDS
-- Exactly as above, but for `report_card` instead of `report_dashboard`

DELETE FROM report_card
  WHERE trashed_from_collection_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM collection WHERE id = trashed_from_collection_id
);

-- Next: set `trashed_directly`.
UPDATE report_card
SET trashed_directly = COALESCE(
  -- If the dashboard's current `collection_id` is the trash collection, then it was trashed directly
  collection_id = (SELECT id FROM collection WHERE type = 'trash'),
  false
  )
WHERE archived = true;

-- Set `collection_id` and `trashed_from_collection_id`
UPDATE report_card
SET collection_id = trashed_from_collection_id, trashed_from_collection_id = NULL
WHERE archived = true;

-- COLLECTIONS
-- First: move all archived collections back to their original locations.

UPDATE collection
SET
  location = trashed_from_location,
  trashed_from_location = NULL
WHERE archived = true;

-- Next: set `collection.trashed_directly`.

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
SET trashed_directly = (
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

-- Set `collection.trash_operation_id` for collections that were trashed directly

UPDATE collection
SET trash_operation_id = LPAD(id::text, 36, '0')
WHERE archived AND trashed_directly;

-- Set `collection.trash_operation_id` for descendants of collections that were trashed directly
WITH Ancestors(id, archived, trashed_directly, trash_operation_id, location) AS (
    SELECT
    id,
    archived,
    trashed_directly,
    trash_operation_id,
    location
  FROM
    collection
  WHERE
    trashed_directly = true
    AND archived = true
)
UPDATE collection
SET trash_operation_id = (
  SELECT a.trash_operation_id
  FROM Ancestors a
  WHERE collection.location LIKE concat(a.location, a.id, '/%')
  ORDER BY LENGTH(a.location) DESC
  LIMIT 1
), trashed_directly = false
WHERE trash_operation_id IS NULL AND archived = true;
