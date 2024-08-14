-- DASHBOARDS
-- Set `archived_directly`.
UPDATE report_dashboard
SET archived_directly = COALESCE(
  -- If the collection the dashboard is in is archived, then it was *not* archived directly
  (SELECT NOT collection.archived FROM collection WHERE collection.id = report_dashboard.collection_id),
  false
)
WHERE archived = true;

-- CARDS
-- Set `archived_directly`.
UPDATE report_card
SET archived_directly = COALESCE(
  -- If the collection the card is in is archived, then it was *not* archived directly
  (SELECT NOT collection.archived FROM collection WHERE collection.id = report_card.collection_id),
  false
  )
WHERE archived = true;

-- COLLECTIONS
-- Set `collection.archived_directly`.
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
SET archived_directly = (
  (with_parent_id.parent_id IS NULL OR NOT parent.archived)
)
WHERE child.archived;

-- Set `collection.archive_operation_id` for collections that were archived directly
UPDATE collection
SET archive_operation_id =
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
WHERE archived AND archived_directly;

-- Set `collection.archive_operation_id` for descendants of collections that were archived directly
WITH RECURSIVE Ancestors (id, archived, archived_directly, archive_operation_id, location) AS (
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

  UNION ALL

  SELECT
    collection.id,
    collection.archived,
    collection.archived_directly,
    parent.archive_operation_id,
    collection.location
    FROM collection
    JOIN Ancestors parent ON collection.location = concat(parent.location, parent.id, '/')
  WHERE collection.archived = true
)
UPDATE collection
JOIN Ancestors ancestor ON collection.id = ancestor.id
SET collection.archive_operation_id = ancestor.archive_operation_id, collection.archived_directly = false
WHERE collection.archive_operation_id IS NULL AND collection.archived = true;
