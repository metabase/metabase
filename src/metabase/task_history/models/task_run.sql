-- Queries for :model/TaskRun. Private sqlvec builders (`-- :name-`, suffixed `-sqlvec`), wrapped
-- into executors in metabase.task-history.models.task-run-queries; see metabase.app-db.hugsql.
--
-- Literal SQL only; user input flows through :value:x params exclusively. Everything here must run
-- unchanged on H2, MySQL, and Postgres. Param naming: column-mirroring params use the column name
-- (snake_case); synthetic inputs are kebab-case.

-- :name- insert-task-run :! :n
INSERT INTO task_run (run_type, entity_type, entity_id, notification_id, status, started_at, updated_at, process_uuid)
VALUES (:value:run_type, :value:entity_type, :value:entity_id, :value:notification_id,
        :value:status, :value:started_at, :value:updated_at, :value:process_uuid)

-- :name- complete-task-run :! :n
UPDATE task_run
SET status = :value:status, ended_at = :value:ended_at
WHERE id = :value:id AND status = 'started'

-- :name- task-run-by-id :? :*
SELECT * FROM task_run WHERE id = :value:id

-- :name- send-heartbeat :! :n
UPDATE task_run
SET updated_at = :value:now
WHERE status = 'started' AND process_uuid = :value:process_uuid

-- :name- distinct-run-entities :? :*
-- Distinct (entity_type, entity_id) for a run type in a [started_from, started_to) window. Used
-- by the entity filter picker. The executor supplies concrete bounds (a far-past / far-future
-- instant when a side is open), so both params are always non-null values, no null-guard needed.
SELECT DISTINCT entity_type, entity_id
FROM task_run
WHERE run_type = :value:run_type
  AND started_at >= :value:started_from
  AND started_at <  :value:started_to
