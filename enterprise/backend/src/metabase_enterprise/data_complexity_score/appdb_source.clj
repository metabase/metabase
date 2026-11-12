(ns metabase-enterprise.data-complexity-score.appdb-source
  "The appdb version checks, universe reads and score write for the Data Complexity CLI.
  The CLI scores an appdb with a jar that may be newer, and it runs no migrations.
  The jar's Toucan models target the jar's schema, so a hook or transform added in a later release would break the CLI
  on every older appdb.
  Card and Table reads and the write therefore go through raw queries here.
  The other reads still use the models: today their hooks and transforms touch none of the columns the CLI reads."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.data-complexity-score.db :as data-complexity-score.db]
   [metabase-enterprise.data-complexity-score.schema :as data-complexity-score.schema]
   [metabase.app-db.core :as mdb]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------- appdb version ----------------------------------------

;; Releases up to 0.59.3 ran the conversion as `v58.2026-01-27T13:00:00`, and from 0.59.2.2 also as
;; `v59.2026-01-27T13:00:00`. `v59.2026-03-17T13:00:00` replaced both, and marks itself ran when either already had.
;; Without any of them, Tables can still hold `bronze`, `silver`, `gold` and `copper`, which the raw Table read does
;; not map.
(def ^:private floor-changeset-ids
  "The changesets that convert the pre-v59 `data_layer` values.
  Every appdb from v59 up records at least one."
  ["v58.2026-01-27T13:00:00" "v59.2026-01-27T13:00:00" "v59.2026-03-17T13:00:00"])

(def ^:private user-settings-reset-changeset-id
  "The v64 changeset that moved user-set Table values into `metabase_table_user_settings` and reset them in
  `metabase_table`."
  "v64.2026-09-11T00:00:06")

(def ^:private user-settings-copy-back-changeset-id
  "The changeset that copies user-set Table values back into `metabase_table`: in 64.5.2, 65.3.2 and later."
  "ceygl0")

(defn- changeset-ran?
  "Whether the appdb's `databasechangelog` records `changeset-id`."
  [changeset-id]
  (some? (mdb/changelog-by-id (mdb/app-db) changeset-id)))

(defn verify-supported-appdb!
  "Return nil when the appdb is at v59 or later.
  Throw an `ex-info` with `:cli-validation true` when it is older."
  []
  (when-not (some changeset-ran? floor-changeset-ids)
    (throw (ex-info (str "This appdb is older than Metabase 0.59 (none of the changesets "
                         (str/join ", " floor-changeset-ids) " has run). "
                         "The complexity-score CLI needs 0.59 or later; score a migrated copy instead.")
                    {:cli-validation true, :changeset-ids floor-changeset-ids}))))

(defn- user-values-only-in-settings-table?
  "True when user-set Table values live only in `metabase_table_user_settings`: 64.0 to 64.5.1 and 65.0 to 65.3.1."
  []
  ;; The settings table outlives the copy-back and is still written, so its existence alone doesn't say which
  ;; table holds the user's values.
  (and (changeset-ran? user-settings-reset-changeset-id)
       (not (changeset-ran? user-settings-copy-back-changeset-id))))

;;; -------------------------------------------- reads --------------------------------------------

(defn- normalize-table-row
  "Return `table-row` with `:is_published` as a boolean."
  [table-row]
  ;; MySQL and MariaDB return `is_published`, and the `CASE` over it, as `0` or `1`, and `0` is truthy.
  ;; The model coerces it with `mi/transform-boolean`.
  (u/update-if-exists table-row :is_published #(or (true? %) (= 1 %))))

(defn reads
  "Return raw replacements for the universe reads, for the `:reads` option of
  [[metabase-enterprise.data-complexity-score.complexity/complexity-scores]].
  Reads `databasechangelog` when called, to pick the Table read for this appdb's version."
  []
  (let [read-tables (if (user-values-only-in-settings-table?)
                      data-complexity-score.db/raw-universe-tables-with-user-settings
                      data-complexity-score.db/raw-universe-tables)]
    {:universe-cards-fn  data-complexity-score.db/raw-universe-cards
     :universe-tables-fn #(mapv normalize-table-row (read-tables %))}))

;;; -------------------------------------------- write --------------------------------------------

(defn verify-write-target-shape!
  "Return nil when `data_complexity_score` has the columns [[insert-score-row!]] writes.
  Throw an `ex-info` with `:cli-validation true` when the probe fails."
  []
  ;; Runs before the scoring pass, so a bad target fails at once rather than after minutes of scoring. Extra
  ;; columns from a newer schema are fine.
  (try
    (data-complexity-score.db/probe-score-columns)
    nil
    (catch Exception e
      (throw (ex-info (str "Can't write to `data_complexity_score`: --write-to-appdb needs the table and its "
                           "fingerprint, source, score_data and created_at columns (Metabase 0.61 or later). "
                           "Underlying error: " (ex-message e))
                      {:cli-validation true}
                      e)))))

(defn insert-score-row!
  "Insert one `data_complexity_score` row with `score` encoded as JSON, running no model hooks or transforms.
  Throw when `score` doesn't match the stored score schema.
  Return nil."
  [fingerprint source score]
  ;; The model path validates this in `db/insert-score!`; the raw insert has to do it itself.
  (let [schema ::data-complexity-score.schema/data-complexity-score.score-data]
    (when-not (mr/validate schema score)
      (throw (ex-info "Data Complexity score doesn't match the stored score schema"
                      {:explain (mr/explain schema score)}))))
  ;; `created_at` comes from the column default, so it is in database time like the rows the cron writes.
  (data-complexity-score.db/insert-score-row! {:fingerprint fingerprint
                                               :source      source
                                               :score_data  (json/encode score)})
  nil)
