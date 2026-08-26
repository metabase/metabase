-- Queries for :model/TaskHistory (HugSQL app-db POC).
--
-- Structure is literal SQL text; user input only ever flows through value
-- params (:value:x -> ?). No raw-splice (:sql:/:snip:) params anywhere -- even
-- the dynamic sort in list-tasks is expressed as value params via CASE
-- no-op sort keys (a CI test enforces the no-splice rule tree-wide).
--
-- Dialect note: everything here must run unchanged on H2, MySQL, and
-- Postgres. Optional filters use the null-guard pattern
-- (:value:x IS NULL OR col = :value:x) so the query shape stays static.

-- :name cleanup-cutoff :? :1
-- Find the ended_at cutoff for cleanup: skip the :keep newest rows
-- (by ended_at) and return the next row's ended_at.
SELECT ended_at
FROM task_history
ORDER BY ended_at DESC
LIMIT 1 OFFSET :value:keep

-- :name delete-ended-before :! :n
DELETE FROM task_history
WHERE ended_at <= :value:cutoff

-- :name list-tasks :? :*
-- Paged task listing. Dynamic sort with fully static SQL: sort column and
-- direction arrive as *values*; each CASE line activates for exactly one
-- (column, direction) pair and is NULL for every row otherwise, so inactive
-- lines are no-op sort keys. Unknown values activate nothing and fall through
-- to the deterministic id DESC tie-break. The LEFT JOIN is unconditional
-- (db_id -> at most one row, so it never changes the row set).
SELECT task_history.*
FROM task_history
LEFT JOIN metabase_database ON task_history.db_id = metabase_database.id
WHERE (:value:task IS NULL OR task_history.task = :value:task)
  AND (:value:status IS NULL OR task_history.status = :value:status)
ORDER BY
  CASE WHEN :value:sort-col = 'started_at' AND :value:sort-dir = 'asc'  THEN task_history.started_at END ASC,
  CASE WHEN :value:sort-col = 'started_at' AND :value:sort-dir = 'desc' THEN task_history.started_at END DESC,
  CASE WHEN :value:sort-col = 'ended_at'   AND :value:sort-dir = 'asc'  THEN task_history.ended_at   END ASC,
  CASE WHEN :value:sort-col = 'ended_at'   AND :value:sort-dir = 'desc' THEN task_history.ended_at   END DESC,
  CASE WHEN :value:sort-col = 'duration'   AND :value:sort-dir = 'asc'  THEN task_history.duration   END ASC,
  CASE WHEN :value:sort-col = 'duration'   AND :value:sort-dir = 'desc' THEN task_history.duration   END DESC,
  CASE WHEN :value:sort-col = 'task'       AND :value:sort-dir = 'asc'  THEN task_history.task       END ASC,
  CASE WHEN :value:sort-col = 'task'       AND :value:sort-dir = 'desc' THEN task_history.task       END DESC,
  CASE WHEN :value:sort-col = 'status'     AND :value:sort-dir = 'asc'  THEN task_history.status     END ASC,
  CASE WHEN :value:sort-col = 'status'     AND :value:sort-dir = 'desc' THEN task_history.status     END DESC,
  CASE WHEN :value:sort-col = 'db_name'    AND :value:sort-dir = 'asc'  THEN metabase_database.name  END ASC,
  CASE WHEN :value:sort-col = 'db_name'    AND :value:sort-dir = 'desc' THEN metabase_database.name  END DESC,
  CASE WHEN :value:sort-col = 'db_engine'  AND :value:sort-dir = 'asc'  THEN metabase_database.engine END ASC,
  CASE WHEN :value:sort-col = 'db_engine'  AND :value:sort-dir = 'desc' THEN metabase_database.engine END DESC,
  task_history.id DESC
LIMIT :value:limit OFFSET :value:offset

-- :name count-tasks :? :1
SELECT COUNT(*) AS cnt
FROM task_history
WHERE (:value:task IS NULL OR task_history.task = :value:task)
  AND (:value:status IS NULL OR task_history.status = :value:status)

-- :name unique-tasks :? :*
SELECT task
FROM task_history
GROUP BY task
ORDER BY task

-- :name insert-task-history :! :n
INSERT INTO task_history (task, db_id, started_at, status, task_details, run_id)
VALUES (:value:task, :value:db_id, :value:started_at, :value:status, :value:task_details, :value:run_id)

-- :name update-task-history :! :n
UPDATE task_history
SET status = :value:status,
    ended_at = :value:ended_at,
    duration = :value:duration,
    task_details = :value:task_details,
    logs = :value:logs
WHERE id = :value:id

-- :name statuses-for-run :? :*
SELECT status
FROM task_history
WHERE run_id = :value:run-id

-- :name tasks-for-run :? :*
SELECT *
FROM task_history
WHERE run_id = :value:run-id
ORDER BY started_at ASC

-- :name mark-orphaned-tasks :! :n
-- 'started' / 'unknown' are the wire values of the :status keyword
-- transform, written literally since they are fixed. CURRENT_TIMESTAMP
-- replaces HoneySQL's :%now (db-side clock, portable across H2/MySQL/PG).
UPDATE task_history
SET status = 'unknown', ended_at = CURRENT_TIMESTAMP
WHERE status = 'started' AND run_id IN (:value*:run-ids)
