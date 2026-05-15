(ns metabase-enterprise.data-complexity-score.appdb-source
  "Raw-JDBC writer for the Data Complexity CLI.

  Why a parallel path? The cron and API run against an appdb at the same Metabase version, so
  they can trust Toucan model transforms + insert hooks on `:model/DataComplexityScore`. The CLI
  must stay safe even when a newer Metabase binary is pointed at an older appdb — e.g. a v73
  CLI sampling a v54 appdb to compute a comparative score. Toucan reads are still acceptable on
  this path (the read-side hooks for entity/setting models are well-understood), but the score
  *write* runs raw so an `:before-insert` migration in a newer model definition can't surprise
  us.

  Contract: at most one `INSERT INTO data_complexity_score` per CLI run. No transforms run
  against the row (`:score_data` is JSON-encoded here, never via `mi/transform-json`), no
  fingerprint setting is touched, no Snowplow event is published."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.util.json :as json]
   [next.jdbc :as jdbc])
  (:import
   (java.sql Timestamp)))

(set! *warn-on-reflection* true)

(defn record-score!
  "Insert one row into `data_complexity_score` via raw JDBC. No Toucan transforms, no model
  hooks. `score-data` is serialized to JSON here so we don't depend on `mi/transform-json`.

  Returns nil. Callers that need the row (e.g. tests) look it up by `fingerprint`."
  [fingerprint source score-data]
  (let [ds  (mdb/data-source)
        row {:fingerprint fingerprint
             :source      source
             :score_data  (json/encode score-data)
             :created_at  (Timestamp. (System/currentTimeMillis))}]
    (jdbc/execute-one! ds (mdb/compile {:insert-into [:data_complexity_score]
                                        :values      [row]}))
    nil))
