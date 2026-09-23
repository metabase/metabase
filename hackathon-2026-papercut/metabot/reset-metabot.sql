-- Removes everything send.ts reported (reporter andreis.metabot) from a papercuts server database, so the next
-- Metabot finding starts a new papercut. `make reset` backs the file up first. A papercut someone else also
-- reported keeps their reports, and one that another papercut was merged into stays.
.bail on
.timeout 5000
PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;
CREATE TEMP TABLE removed AS SELECT count(*) AS reports FROM reports WHERE reporter = 'andreis.metabot';
CREATE TEMP TABLE gone AS SELECT DISTINCT papercut_id AS id FROM reports WHERE reporter = 'andreis.metabot';
DELETE FROM reports WHERE reporter = 'andreis.metabot';
DELETE FROM gone WHERE id IN (SELECT papercut_id FROM reports) OR id IN (SELECT merged_into FROM papercuts WHERE merged_into IS NOT NULL);
DELETE FROM events WHERE papercut_id IN (SELECT id FROM gone);
DELETE FROM relations WHERE papercut_a IN (SELECT id FROM gone) OR papercut_b IN (SELECT id FROM gone);
DELETE FROM papercut_fingerprints WHERE papercut_id IN (SELECT id FROM gone);
DELETE FROM papercuts WHERE id IN (SELECT id FROM gone);
COMMIT;
SELECT printf('removed %d Metabot reports and %d papercuts', (SELECT reports FROM removed), (SELECT count(*) FROM gone));
