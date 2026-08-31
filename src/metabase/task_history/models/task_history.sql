-- Queries for :model/TaskHistory. Loaded as private sqlvec builders and wrapped into executors
-- in metabase.task-history.models.task-history-queries; see metabase.app-db.hugsql for the model.
--
-- Literal SQL only; user input flows through :value:x / :value*:xs params exclusively (raw
-- splices are banned and disarmed; see metabase.app-db.hugsql). Everything here must run
-- unchanged on H2, MySQL, and Postgres.
--
-- Param naming: params that mirror a column use the column name (snake_case), so row maps flow
-- straight in; synthetic inputs are kebab-case (:sort-col, :run-id, :keep).
--
-- Optional filters use `col = COALESCE(:value:x, col)`: when the param is nil the term is
-- `col = col` (filter off), else `col = value`. This keeps one param per filter AND gives
-- Postgres a type for `?` (from the column inside COALESCE) -- unlike the `:value:x IS NULL OR`
-- null-guard, where a bare `?` in `IS NULL` has no inferable type on Postgres. Correct here
-- because both filtered columns (task, status) are NOT NULL; `col = col` would drop a NULL row.

-- :name- cleanup-cutoff :? :1
-- Find the ended_at cutoff for cleanup: skip the :keep newest rows
-- (by ended_at) and return the next row's ended_at.
SELECT ended_at
FROM task_history
ORDER BY ended_at DESC
LIMIT 1 OFFSET :value:keep

-- :name- delete-ended-before :! :n
DELETE FROM task_history
WHERE ended_at <= :value:cutoff

-- :name- list-tasks :? :*
-- Paged task listing. Dynamic sort with fully static SQL: sort column and
-- direction arrive as *values*; each CASE line activates for exactly one
-- (column, direction) pair and is NULL for every row otherwise, so inactive
-- lines are no-op sort keys. Unknown values activate nothing and fall through
-- to the deterministic id DESC tie-break. The LEFT JOIN is unconditional
-- (db_id -> at most one row, so it never changes the row set).
SELECT task_history.*
FROM task_history
LEFT JOIN metabase_database ON task_history.db_id = metabase_database.id
WHERE task_history.task   = COALESCE(:value:task, task_history.task)
  AND task_history.status = COALESCE(:value:status, task_history.status)
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

-- :name- count-tasks :? :1
SELECT COUNT(*) AS cnt
FROM task_history
WHERE task_history.task   = COALESCE(:value:task, task_history.task)
  AND task_history.status = COALESCE(:value:status, task_history.status)

-- :name- unique-tasks :? :*
SELECT task
FROM task_history
GROUP BY task
ORDER BY task

-- :name- insert-task-history :! :n
INSERT INTO task_history (task, db_id, started_at, status, task_details, run_id)
VALUES (:value:task, :value:db_id, :value:started_at, :value:status, :value:task_details, :value:run_id)

-- :name- update-task-history :! :n
UPDATE task_history
SET status = :value:status,
    ended_at = :value:ended_at,
    duration = :value:duration,
    task_details = :value:task_details,
    logs = :value:logs
WHERE id = :value:id

-- :name- task-history-by-id :? :*
SELECT * FROM task_history WHERE id = :value:id

-- :name- task-counts-for-runs :? :*
-- Per-run task counts for the runs listing. :run-ids must be non-empty (executor guards it).
SELECT run_id,
       COUNT(id)                                          AS task_count,
       SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_count,
       SUM(CASE WHEN status = 'failed'  THEN 1 ELSE 0 END) AS failed_count
FROM task_history
WHERE run_id IN (:value*:run-ids)
GROUP BY run_id

-- :name- statuses-for-run :? :*
SELECT status
FROM task_history
WHERE run_id = :value:run-id

-- :name- tasks-for-run :? :*
SELECT *
FROM task_history
WHERE run_id = :value:run-id
ORDER BY started_at ASC

-- :name- mark-orphaned-tasks :! :n
-- 'started' / 'unknown' are the wire values of the :status keyword transform, written literally
-- since they are fixed. :now is bound from Clojure (a real instant) to keep full timestamp
-- precision -- bare CURRENT_TIMESTAMP is second-resolution on MySQL. :run-ids must be non-empty
-- (empty -> "IN ()" is a syntax error); the executor guards it.
UPDATE task_history
SET status = 'unknown', ended_at = :value:now
WHERE status = 'started' AND run_id IN (:value*:run-ids)
