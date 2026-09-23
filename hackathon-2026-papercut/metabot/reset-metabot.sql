-- Removes every Metabot report (a `metabot:` fingerprint, or reporter andreis.metabot) from a papercuts server database,
-- so the next Metabot finding starts a new papercut. `make reset` backs the file up first. A papercut someone else also
-- reported keeps their reports, and one that another papercut was merged into stays.
.bail on
.timeout 5000
PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;
CREATE TEMP TABLE metabot AS SELECT id, papercut_id FROM reports WHERE fingerprint GLOB 'metabot:*' OR reporter = 'andreis.metabot';
CREATE TEMP TABLE removed AS SELECT count(*) AS reports FROM metabot;
CREATE TEMP TABLE gone AS SELECT DISTINCT papercut_id AS id FROM metabot;
DELETE FROM reports WHERE id IN (SELECT id FROM metabot);
DELETE FROM gone WHERE id IN (SELECT papercut_id FROM reports) OR id IN (SELECT merged_into FROM papercuts WHERE merged_into IS NOT NULL);
-- Schema v5's dispatches (which reference assessments) and assessments, and v8's pull requests, go first. SQLite has
-- no DELETE IF EXISTS, so these deletes are written out, then read back, only for the tables this database has.
.once reset-metabot.tmp.sql
SELECT printf('DELETE FROM %s WHERE papercut_id IN (SELECT id FROM gone);', name) FROM sqlite_master
 WHERE type = 'table' AND name IN ('dispatches', 'assessments', 'pull_requests') ORDER BY name = 'assessments';
.read reset-metabot.tmp.sql
.shell rm -f reset-metabot.tmp.sql
DELETE FROM events WHERE papercut_id IN (SELECT id FROM gone);
DELETE FROM relations WHERE papercut_a IN (SELECT id FROM gone) OR papercut_b IN (SELECT id FROM gone);
DELETE FROM papercut_fingerprints WHERE papercut_id IN (SELECT id FROM gone);
DELETE FROM papercuts WHERE id IN (SELECT id FROM gone);
COMMIT;
SELECT printf('removed %d Metabot reports and %d papercuts', (SELECT reports FROM removed), (SELECT count(*) FROM gone));
