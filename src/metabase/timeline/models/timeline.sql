-- Queries for :model/Timeline. Private sqlvec builders wrapped into executors in
-- metabase.timeline.models.timeline-queries; see metabase.app-db.hugsql. Literal SQL only; input
-- flows through :value: params. Portable across H2, MySQL, Postgres.

-- :name- timelines-for-collection :? :*
-- Timelines in a collection. Root is collection_id IS NULL, requested via :root? = true (an int
-- flag, so Postgres can type the param; a bare `? IS NULL` cannot). When :root? is false the
-- :collection-id value selects the collection. `archived` is a plain value.
SELECT *
FROM timeline
WHERE ((:value:root? = 1 AND collection_id IS NULL)
       OR (:value:root? = 0 AND collection_id = :value:collection-id))
  AND archived = :value:archived
