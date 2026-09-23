-- Views the Metabase data app reads. Idempotent: dropped and recreated on every apply (views hold no data;
-- the dashboard's cards are native SQL, so nothing in Metabase references view metadata).
-- Apply after 01-schema.sql (`npm run schema` in hackathon/harness/results applies both).
--
-- One run = one embedder (§5.2) and one embedding-text variant (§5.2a), so comparing either means comparing
-- runs. Observations and metrics are scoped to the latest *valid* run per (corpus, scale, embedder,
-- embedding_text, text_strategy, engine): per engine, because some engine columns need their own instance and therefore their
-- own run (e.g. semantic-pure, booted with the appdb top-up disabled). Pairwise agreement stays within one run.
-- Older runs stay in the base tables untouched.
--
-- Cards filter on corpus_id / data_scale / embedder / embedding_text / text_strategy. Views that use DISTINCT ON lead their
-- key with those columns so the planner can push the cards' filters below the de-duplication.

DROP VIEW IF EXISTS harness_latest_run CASCADE;  -- pre-harness_valid_run versions did not depend on it
DROP VIEW IF EXISTS harness_valid_run CASCADE;
DROP VIEW IF EXISTS harness_run_concurrency CASCADE;

-- Runs fit to show: finished (the runner leaves a run unfinished when it fails its end-of-run checks), with an
-- embedder, and not forced past a failed preflight (notes.publishable = false). Fixture runs carry plain-text
-- notes, hence the guard before the jsonb cast.
CREATE VIEW harness_valid_run AS
SELECT *
FROM harness_run
WHERE finished_at IS NOT NULL
  AND embedder IS NOT NULL
  AND (CASE WHEN notes ~ '^\s*\{' THEN notes::jsonb ->> 'publishable' END) IS DISTINCT FROM 'false';

-- Latest valid run per (corpus, scale, embedder, embedding text): run-level facts ("runs in view").
CREATE VIEW harness_latest_run AS
SELECT DISTINCT ON (corpus_id, data_scale, embedder, embedding_text, text_strategy)
       run_id, corpus_id, data_scale, embedder, embedding_text, text_strategy, finished_at, git_sha, notes
FROM harness_valid_run
ORDER BY corpus_id, data_scale, embedder, embedding_text, text_strategy, started_at DESC;

-- Latest valid run per engine within (corpus, scale, embedder, embedding text). Everything below joins on
-- (run_id, engine), so a later run that measured other engines never hides an earlier run's engines.
CREATE VIEW harness_latest_engine_run AS
SELECT DISTINCT ON (r.corpus_id, r.data_scale, r.embedder, r.embedding_text, r.text_strategy, e.engine)
       r.run_id, e.engine, r.corpus_id, r.data_scale, r.embedder, r.embedding_text, r.text_strategy, r.started_at
FROM harness_valid_run r
JOIN (SELECT DISTINCT run_id, engine FROM harness_query_result) e USING (run_id)
ORDER BY r.corpus_id, r.data_scale, r.embedder, r.embedding_text, r.text_strategy, e.engine, r.started_at DESC;

-- Raw observations of the latest runs, for latency percentiles computed straight from the data.
CREATE VIEW harness_latest_observation AS
SELECT lr.corpus_id, lr.data_scale, lr.embedding_text, lr.text_strategy, q.*
FROM harness_query_result q
JOIN harness_latest_engine_run lr ON lr.run_id = q.run_id AND lr.engine = q.engine;

-- Per-scenario, single-engine metrics of the latest runs, with the scenario's tags.
CREATE VIEW harness_scenario_metric AS
SELECT lr.corpus_id, lr.data_scale, lr.embedding_text, lr.text_strategy, m.run_id, m.engine, m.embedder, m.scenario_id,
       s.tags, m.metric, m.value
FROM harness_metric m
JOIN harness_latest_engine_run lr ON lr.run_id = m.run_id AND lr.engine = m.engine
JOIN harness_scenario s ON s.run_id = m.run_id AND s.scenario_id = m.scenario_id
WHERE m.scenario_id IS NOT NULL
  AND m.engine_b IS NULL;

-- Same, one row per tag. A scenario with two tags counts in both slices, so never sum across tags.
CREATE VIEW harness_tag_metric AS
SELECT sm.*, t.tag
FROM harness_scenario_metric sm
CROSS JOIN LATERAL unnest(sm.tags) AS t(tag);

-- The ranked list each engine returned per scenario: first successful iteration of the latest run.
-- Engines are deterministic per query, so any iteration would do; errored iterations are skipped.
-- top10 is built after the de-duplication, so jsonb is expanded once per list rather than per iteration.
CREATE VIEW harness_latest_list AS
SELECT l.*,
       ARRAY(SELECT (x.e ->> 'model') || ':' || (x.e ->> 'id')
             FROM jsonb_array_elements(l.returned) WITH ORDINALITY AS x(e, rnk)
             WHERE x.rnk <= 10
             ORDER BY x.rnk) AS top10
FROM (
  SELECT DISTINCT ON (o.corpus_id, o.data_scale, o.embedder, o.embedding_text, o.text_strategy, o.run_id, o.engine, o.scenario_id)
         o.corpus_id, o.data_scale, o.embedder, o.embedding_text, o.text_strategy, o.run_id, o.engine, o.scenario_id, o.returned
  FROM harness_latest_observation o
  WHERE o.error IS NULL
  ORDER BY o.corpus_id, o.data_scale, o.embedder, o.embedding_text, o.text_strategy, o.run_id, o.engine, o.scenario_id, o.iteration
) l;

-- Ranked results exploded one row per rank, with the relevance grade from the labels (NULL = not relevant).
-- An engine that returned nothing yields one row with a NULL rank, so "no results" needs no second pass.
CREATE VIEW harness_ranked_result AS
SELECT l.corpus_id, l.data_scale, l.embedding_text, l.text_strategy, l.embedder, l.engine, l.scenario_id,
       x.rnk::int                      AS rank,
       x.e ->> 'model'                 AS model,
       (x.e ->> 'id')::int             AS entity_id,
       x.e ->> 'name'                  AS name,
       (x.e ->> 'score')::float        AS score,
       (SELECT (ex ->> 'grade')::int
        FROM jsonb_array_elements(s.expected) ex
        WHERE ex ->> 'model' = x.e ->> 'model' AND ex ->> 'id' = x.e ->> 'id') AS grade
FROM harness_latest_list l
JOIN harness_scenario s ON s.run_id = l.run_id AND s.scenario_id = l.scenario_id
LEFT JOIN LATERAL jsonb_array_elements(l.returned) WITH ORDINALITY AS x(e, rnk) ON true;

-- Pairwise Jaccard@10, recomputed from `returned` so it works whether or not the metrics library stored
-- pairwise rows. NULL when both engines returned nothing (agreement on emptiness is not overlap). The join
-- repeats the key columns so a filter on a.* also reaches b's de-duplication. data_scale is NULL for runs
-- that are not a scale tier (the golden set), hence IS NOT DISTINCT FROM.
CREATE VIEW harness_agreement AS
SELECT a.corpus_id, a.data_scale, a.embedding_text, a.text_strategy, a.embedder, a.engine, b.engine AS engine_b, a.scenario_id,
       (SELECT count(*) FROM unnest(a.top10) i WHERE i = ANY (b.top10))::float
         / NULLIF((SELECT count(DISTINCT u) FROM unnest(a.top10 || b.top10) u), 0) AS jaccard
FROM harness_latest_list a
JOIN harness_latest_list b
  ON b.corpus_id = a.corpus_id AND b.data_scale IS NOT DISTINCT FROM a.data_scale AND b.embedder = a.embedder
 AND b.embedding_text = a.embedding_text AND b.text_strategy = a.text_strategy AND b.run_id = a.run_id
 AND b.scenario_id = a.scenario_id AND b.engine <> a.engine;

-- Where quality variance comes from: main-effect sums of squares as shares of the total, per metric.
-- Keyword engines are excluded — they ignore the embedder, so including them would credit the
-- keyword-vs-vector gap to "engine" and hide the question this answers: among engines that use embeddings,
-- does the store or the model matter more? Keep the list in sync with KEYWORD_ENGINES in shared/types.ts.
-- Unbalanced cells (errors, missing metrics) make this approximate; the shares are a guide, not an ANOVA.
CREATE VIEW harness_variance_share AS
WITH d AS (
  SELECT corpus_id, data_scale, embedding_text, text_strategy, metric, engine, embedder, scenario_id, value
  FROM harness_scenario_metric
  WHERE engine NOT IN ('appdb', 'in-place')
), w AS (
  SELECT d.*,
         avg(value) OVER (PARTITION BY corpus_id, data_scale, embedding_text, text_strategy, metric)              AS g,
         avg(value) OVER (PARTITION BY corpus_id, data_scale, embedding_text, text_strategy, metric, engine)      AS m_engine,
         avg(value) OVER (PARTITION BY corpus_id, data_scale, embedding_text, text_strategy, metric, embedder)    AS m_embedder,
         avg(value) OVER (PARTITION BY corpus_id, data_scale, embedding_text, text_strategy, metric, scenario_id) AS m_scenario
  FROM d
), ss AS (
  SELECT corpus_id, data_scale, embedding_text, text_strategy, metric,
         count(DISTINCT scenario_id)   AS n_scenarios,
         sum((m_engine - g) ^ 2)       AS ss_engine,
         sum((m_embedder - g) ^ 2)     AS ss_embedder,
         sum((m_scenario - g) ^ 2)     AS ss_scenario,
         sum((value - g) ^ 2)          AS ss_total
  FROM w
  GROUP BY corpus_id, data_scale, embedding_text, text_strategy, metric
)
SELECT ss.corpus_id, ss.data_scale, ss.embedding_text, ss.text_strategy, ss.metric, ss.n_scenarios, v.ord, v.source,
       v.ss / NULLIF(ss.ss_total, 0) AS share
FROM ss
CROSS JOIN LATERAL (VALUES
  (1, 'Embedder',                     ss.ss_embedder),
  (2, 'Engine',                       ss.ss_engine),
  (3, 'Query (scenario difficulty)',  ss.ss_scenario),
  (4, 'Interactions + noise',         ss.ss_total - ss.ss_engine - ss.ss_embedder - ss.ss_scenario)
) AS v(ord, source, ss);

-- BL-37/38: whether a run's timed phase overlapped other work, so latency cards can leave it out (concurrent work competes
-- for CPU and Ollama). Two checks, either one flags the run:
--   1. another run's timed phase (covers runs from before the queue, which have no job row);
--   2. another queue job's whole window, boot and indexing included (harness_job; a job still running counts until
--      now()). A run's own job is recognised by harness_run.job_id (stamped when the run starts), or, for earlier
--      queue runs without it, by harness_job.run_ids.
-- Strict < on both ends: work that ends exactly when a run starts is not an overlap. An unfinished run counts as
-- its start instant only, so a crashed run does not flag every run after it.
CREATE VIEW harness_run_concurrency AS
WITH w AS (SELECT run_id, job_id, started_at AS s, coalesce(finished_at, started_at) AS e FROM harness_run)
SELECT a.run_id,
       EXISTS (SELECT 1 FROM w b WHERE b.run_id <> a.run_id AND b.s < a.e AND a.s < b.e)
       OR EXISTS (SELECT 1 FROM harness_job j
                  WHERE j.job_id IS DISTINCT FROM a.job_id AND NOT (a.run_id = ANY (j.run_ids))
                    AND j.started_at < a.e AND a.s < coalesce(j.finished_at, now())) AS overlapped
FROM w a;
