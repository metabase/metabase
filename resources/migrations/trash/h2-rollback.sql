UPDATE report_dashboard
SET collection_id = (SELECT id FROM collection WHERE type = 'trash'),
    trashed_from_collection_id = collection_id
WHERE trashed_directly = true;

-- Next: set `trashed_directly`.
UPDATE report_card
SET collection_id = (SELECT id FROM collection WHERE type = 'trash'),
    trashed_from_collection_id = collection_id
WHERE trashed_directly = true;

UPDATE collection AS c1
SET
  trashed_from_location = c1.location,
  location = CONCAT('/', (SELECT id FROM collection WHERE type = 'trash'), '/')
WHERE c1.trashed_directly = true AND c1.archived = true AND c1.namespace IS NULL;
