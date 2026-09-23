-- Harness results store. 01-contracts.md §4, verbatim, made idempotent.
-- Apply: docker exec -i semantic_search-postgres-1 psql -U postgres -d harness -v ON_ERROR_STOP=1 < 01-schema.sql

CREATE TABLE IF NOT EXISTS harness_run (
  run_id       text PRIMARY KEY,
  started_at   timestamptz NOT NULL,
  finished_at  timestamptz,
  git_sha      text,
  branch       text,
  data_scale   int,
  corpus_id    text,
  host         text,
  notes        text
);

CREATE TABLE IF NOT EXISTS harness_query_result (
  run_id        text REFERENCES harness_run(run_id),
  engine        text NOT NULL,
  embedder      text NOT NULL,
  dimensions    int,
  scenario_id   text NOT NULL,
  iteration     int NOT NULL,
  latency_ms    double precision,
  embed_ms      double precision,
  store_ms      double precision,
  filter_ms     double precision,
  result_count  int,
  raw_count     int,
  returned      jsonb,
  error         text,
  PRIMARY KEY (run_id, engine, embedder, scenario_id, iteration)
);

CREATE TABLE IF NOT EXISTS harness_metric (
  run_id       text REFERENCES harness_run(run_id),
  engine       text NOT NULL,
  engine_b     text,                      -- pairwise metrics only (Agent C)
  embedder     text NOT NULL,
  scenario_id  text,
  tag          text,
  metric       text NOT NULL,
  value        double precision NOT NULL
);

-- Labels are per run, not per corpus: entity ids differ per instance (the corpus is re-created on each), so
-- two runs of one corpus can carry different expected ids. corpus_id is kept for readability and filtering.
CREATE TABLE IF NOT EXISTS harness_scenario (
  run_id           text NOT NULL REFERENCES harness_run(run_id),
  corpus_id        text NOT NULL,
  scenario_id      text NOT NULL,
  query            text NOT NULL,
  tags             text[] NOT NULL,
  lang             text,
  expected         jsonb,
  expected_absent  jsonb,
  notes            text,
  PRIMARY KEY (run_id, scenario_id)
);

-- Migration from the corpus-keyed table: copy each corpus's labels onto every run of that corpus.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'harness_scenario' AND column_name = 'run_id') THEN
    ALTER TABLE harness_scenario RENAME TO harness_scenario_by_corpus;
    ALTER TABLE harness_scenario_by_corpus RENAME CONSTRAINT harness_scenario_pkey TO harness_scenario_by_corpus_pkey;
    CREATE TABLE harness_scenario (
      run_id           text NOT NULL REFERENCES harness_run(run_id),
      corpus_id        text NOT NULL,
      scenario_id      text NOT NULL,
      query            text NOT NULL,
      tags             text[] NOT NULL,
      lang             text,
      expected         jsonb,
      expected_absent  jsonb,
      notes            text,
      PRIMARY KEY (run_id, scenario_id)
    );
    INSERT INTO harness_scenario
    SELECT r.run_id, s.corpus_id, s.scenario_id, s.query, s.tags, s.lang, s.expected, s.expected_absent, s.notes
    FROM harness_scenario_by_corpus s JOIN harness_run r ON r.corpus_id = s.corpus_id;
    DROP TABLE harness_scenario_by_corpus CASCADE;
  END IF;
END $$;

-- Tables created before engine_b was added to the contract.
ALTER TABLE harness_metric ADD COLUMN IF NOT EXISTS engine_b text;

-- Axis 4 (Agent E): the search-embedding-text-variant the run was indexed with. One run = one variant.
ALTER TABLE harness_run ADD COLUMN IF NOT EXISTS embedding_text text NOT NULL DEFAULT 'baseline';

-- A run holds exactly one embedder (§5.2). The writer stamps it from the first observation batch and
-- rejects a batch with a different one; the backfill covers runs written before this column existed.
ALTER TABLE harness_run ADD COLUMN IF NOT EXISTS embedder text;
-- What the corpus's descriptions were rewritten with before applying (Agent I's text strategies, e.g.
-- "mech-fill-empty"); 'none' = the corpus as authored. Independent of embedding_text (E's Metabase setting).
ALTER TABLE harness_run ADD COLUMN IF NOT EXISTS text_strategy text NOT NULL DEFAULT 'none';
-- The queue job (harness_job.job_id) that produced this run; NULL for runs launched outside runner/src/queue.ts.
-- Set when the run starts, so a finished run's own still-running job is never mistaken for a concurrent one.
ALTER TABLE harness_run ADD COLUMN IF NOT EXISTS job_id text;
UPDATE harness_run r SET embedder = q.embedder
FROM (SELECT DISTINCT ON (run_id) run_id, embedder FROM harness_query_result ORDER BY run_id) q
WHERE r.run_id = q.run_id AND r.embedder IS NULL;

-- Named so re-applying is a no-op (the contract's anonymous CREATE INDEX would duplicate).
CREATE INDEX IF NOT EXISTS harness_metric_run_metric_idx ON harness_metric (run_id, metric);
-- The contract's (run_id, engine) index is a prefix of the primary key, so it only slows inserts.
DROP INDEX IF EXISTS harness_query_result_run_engine_idx;

-- BL-37: whole pipeline jobs as run by runner/src/queue.ts (boot + apply + indexing + timed runs), so latency
-- hygiene can ask "did anything else load Ollama/CPU while this run was timing?". Written by the queue daemon.
CREATE TABLE IF NOT EXISTS harness_job (
  job_id       text PRIMARY KEY,
  kind         text NOT NULL,              -- quality | latency | hold
  label        text,
  requested_by text,
  port         int,
  started_at   timestamptz NOT NULL,
  finished_at  timestamptz,                -- NULL while running
  exit_code    int,
  run_ids      text[] NOT NULL DEFAULT '{}'
);
