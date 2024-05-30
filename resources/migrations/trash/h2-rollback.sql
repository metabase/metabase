UPDATE report_dashboard
SET collection_id = (SELECT id FROM collection WHERE type = 'trash'),
    trashed_from_collection_id = collection_id
WHERE trashed_directly = true;

-- Next: set `trashed_directly`.
UPDATE report_card
SET collection_id = (SELECT id FROM collection WHERE type = 'trash'),
    trashed_from_collection_id = collection_id
WHERE trashed_directly = true;

WITH trash AS (SELECT id FROM collection WHERE type = 'trash')
UPDATE collection AS c1
SET
  trashed_from_location = c1.location,
  location = CONCAT('/', trash.id, '/')
WHERE c1.trashed_directly = true;
