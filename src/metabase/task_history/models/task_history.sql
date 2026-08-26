-- Queries for :model/TaskHistory (HugSQL app-db POC).
--
-- Structure is literal SQL text; user input only ever flows through value
-- params (:v:x -> ?). The single piece of dynamic structure -- the ORDER BY
-- for the paged list -- is spliced via :sql:order-by, whose value is only
-- ever selected from the closed literal map `order-by-fragments` in
-- metabase.task-history.models.task-history. No other :sql:/:snip: params
-- are allowed in this file.
--
-- Dialect note: everything here must run unchanged on H2, MySQL, and
-- Postgres. Optional filters use the null-guard pattern
-- (:v:x IS NULL OR col = :v:x) so the query shape stays static.

-- :name cleanup-cutoff :? :1
-- Find the ended_at cutoff for cleanup: skip the :keep newest rows
-- (by ended_at) and return the next row's ended_at.
SELECT ended_at
FROM task_history
ORDER BY ended_at DESC
LIMIT 1 OFFSET :v:keep

-- :name delete-ended-before :! :n
DELETE FROM task_history
WHERE ended_at <= :v:cutoff

-- :name list-tasks :? :*
-- Paged task listing, sorted by a task_history column.
SELECT task_history.*
FROM task_history
WHERE (:v:task IS NULL OR task_history.task = :v:task)
  AND (:v:status IS NULL OR task_history.status = :v:status)
ORDER BY :sql:order-by
LIMIT :v:limit OFFSET :v:offset

-- :name list-tasks-joined :? :*
-- Paged task listing sorted by a joined metabase_database column
-- (db_name / db_engine). Row shape stays task_history.*.
SELECT task_history.*
FROM task_history
LEFT JOIN metabase_database ON task_history.db_id = metabase_database.id
WHERE (:v:task IS NULL OR task_history.task = :v:task)
  AND (:v:status IS NULL OR task_history.status = :v:status)
ORDER BY :sql:order-by
LIMIT :v:limit OFFSET :v:offset

-- :name count-tasks :? :1
SELECT COUNT(*) AS cnt
FROM task_history
WHERE (:v:task IS NULL OR task_history.task = :v:task)
  AND (:v:status IS NULL OR task_history.status = :v:status)

-- :name unique-tasks :? :*
SELECT task
FROM task_history
GROUP BY task
ORDER BY task

-- :name insert-task-history :! :n
INSERT INTO task_history (task, db_id, started_at, status, task_details, run_id)
VALUES (:v:task, :v:db_id, :v:started_at, :v:status, :v:task_details, :v:run_id)

-- :name update-task-history :! :n
UPDATE task_history
SET status = :v:status,
    ended_at = :v:ended_at,
    duration = :v:duration,
    task_details = :v:task_details,
    logs = :v:logs
WHERE id = :v:id

-- :name statuses-for-run :? :*
SELECT status
FROM task_history
WHERE run_id = :v:run-id

-- :name tasks-for-run :? :*
SELECT *
FROM task_history
WHERE run_id = :v:run-id
ORDER BY started_at ASC

-- :name mark-orphaned-tasks :! :n
-- 'started' / 'unknown' are the wire values of the :status keyword
-- transform, written literally since they are fixed. CURRENT_TIMESTAMP
-- replaces HoneySQL's :%now (db-side clock, portable across H2/MySQL/PG).
UPDATE task_history
SET status = 'unknown', ended_at = CURRENT_TIMESTAMP
WHERE status = 'started' AND run_id IN (:v*:run-ids)
