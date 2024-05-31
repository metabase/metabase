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
UPDATE collection AS child
JOIN (
  SELECT
    id,
    CASE
      WHEN location = '/' THEN NULL
      ELSE SUBSTRING_INDEX(SUBSTRING_INDEX(location, '/', -2), '/', 1)
    END AS parent_id
    FROM collection
) AS with_parent_id ON child.id = with_parent_id.id
LEFT JOIN (
  SELECT id, archived
  FROM collection
) AS parent ON with_parent_id.parent_id = parent.id
SET trashed_directly = (
  (with_parent_id.parent_id IS NULL OR NOT parent.archived)
)
WHERE child.archived;

-- Set `collection.trash_operation_id` for collections that were trashed directly
UPDATE collection
SET trash_operation_id =
CASE
    WHEN LENGTH(CAST(id AS CHAR)) <= 12 THEN
        CONCAT('00000000-0000-0000-0000-', LPAD(CAST(id AS CHAR), 12, '0'))
    WHEN LENGTH(CAST(id AS CHAR)) > 12 AND LENGTH(CAST(id AS CHAR)) <= 16 THEN
        CONCAT('00000000-0000-0000-',
               LPAD(SUBSTRING(CAST(id AS CHAR), 1, LENGTH(CAST(id AS CHAR)) - 12), 4, '0'), '-',
               SUBSTRING(CAST(id AS CHAR), LENGTH(CAST(id AS CHAR)) - 11, 12))
    WHEN LENGTH(CAST(id AS CHAR)) > 16 AND LENGTH(CAST(id AS CHAR)) <= 20 THEN
        CONCAT('00000000-0000-',
               LPAD(SUBSTRING(CAST(id AS CHAR), 1, 4), 4, '0'), '-',
               LPAD(SUBSTRING(CAST(id AS CHAR), 5, 4), 4, '0'), '-',
               SUBSTRING(CAST(id AS CHAR), 9))
    WHEN LENGTH(CAST(id AS CHAR)) > 20 THEN
        CONCAT(
               LPAD(SUBSTRING(CAST(id AS CHAR), 1, 8), 8, '0'), '-',
               LPAD(SUBSTRING(CAST(id AS CHAR), 9, 4), 4, '0'), '-',
               LPAD(SUBSTRING(CAST(id AS CHAR), 13, 4), 4, '0'), '-',
               LPAD(SUBSTRING(CAST(id AS CHAR), 17, 12), 12, '0')
        )
    ELSE '00000000-0000-0000-0000-000000000000'
END
WHERE archived AND trashed_directly;

-- Set `collection.trash_operation_id` for descendants of collections that were trashed directly
WITH RECURSIVE Ancestors (id, archived, trashed_directly, trash_operation_id, location) AS (
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

  UNION ALL

  SELECT
    collection.id,
    collection.archived,
    collection.trashed_directly,
    parent.trash_operation_id,
    collection.location
    FROM collection
    JOIN Ancestors parent ON collection.location = concat(parent.location, parent.id, '/')
  WHERE collection.archived = true
)
UPDATE collection
JOIN Ancestors ancestor ON collection.id = ancestor.id
SET collection.trash_operation_id = ancestor.trash_operation_id, collection.trashed_directly = false
WHERE collection.trash_operation_id IS NULL AND collection.archived = true;
