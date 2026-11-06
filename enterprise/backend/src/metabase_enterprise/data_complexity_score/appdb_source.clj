(ns metabase-enterprise.data-complexity-score.appdb-source
  "The universe reads and the score write for the Data Complexity CLI.
  The CLI scores an appdb with a jar that may be newer, and it runs no migrations. The jar's Toucan models target the
  jar's schema, so a hook or transform added in a later release would break the CLI on every older appdb. Card and
  Table reads and the write therefore go through raw queries here. The other reads still use the models: today their
  hooks and transforms touch none of the columns the CLI reads."
  (:require
   [metabase-enterprise.data-complexity-score.db :as data-complexity-score.db]
   [metabase.util :as u]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------- reads --------------------------------------------

(defn- normalize-table-row
  "Return `table-row` with `:is_published` as a boolean."
  [table-row]
  ;; MySQL and MariaDB return `is_published` as `0` or `1`, and `0` is truthy. `:model/Table` coerces it with
  ;; `mi/transform-boolean`.
  (u/update-if-exists table-row :is_published #(or (true? %) (= 1 %))))

(defn reads
  "The universe reads for [[metabase-enterprise.data-complexity-score.complexity/complexity-scores]]'s `:reads`, as
  raw queries."
  []
  {:universe-cards-fn  data-complexity-score.db/raw-universe-cards
   :universe-tables-fn #(mapv normalize-table-row (data-complexity-score.db/raw-universe-tables %))})

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
  Return nil."
  [fingerprint source score]
  ;; `created_at` comes from the column default, so it is in database time like the rows the cron writes.
  (data-complexity-score.db/insert-score-row! {:fingerprint fingerprint
                                               :source      source
                                               :score_data  (json/encode score)})
  nil)
