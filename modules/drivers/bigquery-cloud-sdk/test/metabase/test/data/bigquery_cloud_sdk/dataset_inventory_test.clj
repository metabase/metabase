(ns ^:mb/driver-tests metabase.test.data.bigquery-cloud-sdk.dataset-inventory-test
  "Read-only census of every dataset in the BigQuery test project, to decide what retention should delete.

  Deletes nothing and creates nothing. The one query it runs reads `INFORMATION_SCHEMA.SCHEMATA` and the tracking
  table, so it is safe to run against the shared project while CI is going.

  Run it from the drivers workflow with driver `bigquery` and `tests` set to

    metabase.test.data.bigquery-cloud-sdk.dataset-inventory-test/report-dataset-inventory-test"
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.data.bigquery-cloud-sdk :as bigquery.tx]))

(set! *warn-on-reflection* true)

(def ^:private reap-after-days
  "The age at which [[bigquery.tx/delete-old-datasets!]] would delete a dataset today. Mirrored here rather than shared
  because this namespace reports on the reaper without depending on it being enabled."
  14)

(defn- kind
  "Which naming scheme produced `dataset-id`, which is the closest thing to a record of what made it.

  [[bigquery.tx/test-dataset-id]] stamps a content hash into every dataset it creates, prefixed `sha_rel_` from
  master and release branches and `sha__` from everything else. A name matching neither was made by something other
  than the current test extensions - an older scheme, another tool, or a person."
  [dataset-id]
  (cond
    (= dataset-id "metabase_test_tracking")  :tracking-table
    (str/starts-with? dataset-id "sha_rel_") :gold-release
    (str/starts-with? dataset-id "sha__")    :gold-branch
    (str/starts-with? dataset-id "sha_")     :gold-other-scheme
    :else                                    :foreign))

(def ^:private kind-order
  [:gold-release :gold-branch :gold-other-scheme :foreign :tracking-table])

(defn- inventory
  "One row per dataset in the project, as maps.

  Ages come back from BigQuery already converted to whole hours so that nothing here has to parse a timestamp or
  reason about a time zone. `accessed-hours` is nil for a dataset the tracking table has never seen."
  []
  (let [sql (str "SELECT s.schema_name,"
                 " TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), s.creation_time, HOUR),"
                 " TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), s.last_modified_time, HOUR),"
                 " TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), t.accessed_at, HOUR),"
                 " t.access_note"
                 " FROM `%1$s`.INFORMATION_SCHEMA.SCHEMATA s"
                 " LEFT JOIN `%1$s.metabase_test_tracking.datasets` t ON t.name = s.schema_name"
                 " ORDER BY s.schema_name")]
    (for [[dataset-id created-hours modified-hours accessed-hours note]
          (bigquery.tx/execute! sql (bigquery.tx/project-id))]
      {:dataset-id     dataset-id
       :kind           (kind dataset-id)
       :created-hours  created-hours
       :modified-hours modified-hours
       :accessed-hours accessed-hours
       :access-note    note})))

(defn- reapable?
  "Whether [[bigquery.tx/delete-old-datasets!]] would delete this dataset today.

  Two independent rules, and the second is why an untracked dataset that does not look like test data survives no
  matter how old it gets: the reaper's second branch only matches names beginning `sha_`."
  [{:keys [kind created-hours accessed-hours]}]
  (let [cutoff (* 24 reap-after-days)]
    (if accessed-hours
      (> accessed-hours cutoff)
      (and (not= kind :foreign)
           (not= kind :tracking-table)
           (> created-hours cutoff)))))

(defn- last-activity-hours
  "Best available evidence of when anything last happened to a dataset.

  `last_modified_time` moves when a table is written, so it catches use that never reached the tracking table - which
  matters here precisely because the tracking write has been failing silently under contention."
  [{:keys [created-hours modified-hours accessed-hours]}]
  (->> [created-hours modified-hours accessed-hours] (remove nil?) (reduce min Long/MAX_VALUE)))

(def ^:private age-buckets
  [["< 1 day" 24] ["1-7 days" 168] ["7-14 days" 336] ["14-30 days" 720]
   ["30-90 days" 2160] ["90-365 days" 8760] ["> 1 year" Long/MAX_VALUE]])

(defn- bucket-of [hours]
  (first (first (filter (fn [[_ limit]] (< hours limit)) age-buckets))))

(defn- say!
  "`println` rather than `log/info` because this report exists to be read in the workflow's console output, and the
  console appender in `test_config/log4j2-test.xml` filters below FATAL."
  [& args]
  #_{:clj-kondo/ignore [:discouraged-var]}
  (println (apply str args)))

(defn- print-table!
  "Print `rows` (vectors of already-stringified cells) under `headers`, padded to the widest cell in each column."
  [headers rows]
  (let [widths (apply map (fn [& cells] (apply max (map count cells))) headers rows)
        line   (fn [cells]
                 (str/trimr (str/join "  " (map (fn [c w] (format (str "%-" w "s") c)) cells widths))))]
    (say! (line headers))
    (say! (str/join "  " (map #(apply str (repeat % "-")) widths)))
    (doseq [row rows]
      (say! (line row)))))

(defn- days [hours]
  (if hours (format "%.1f" (/ hours 24.0)) "-"))

(defn- report-by-kind! [rows]
  (say! "\n=== BY KIND ===")
  (print-table!
   ["kind" "count" "tracked" "never-tracked" "reapable-now" "oldest-created-days"]
   (for [k kind-order
         :let [ds (filter #(= k (:kind %)) rows)]
         :when (seq ds)]
     [(name k)
      (str (count ds))
      (str (count (filter :accessed-hours ds)))
      (str (count (remove :accessed-hours ds)))
      (str (count (filter reapable? ds)))
      (days (apply max (map :created-hours ds)))])))

(defn- report-activity! [rows]
  (say! "\n=== TIME SINCE LAST ACTIVITY (last_modified_time or accessed_at, whichever is newer) ===")
  (let [by-bucket (group-by #(bucket-of (last-activity-hours %)) rows)]
    (print-table!
     ["age" "count" "kinds"]
     (for [[label _] age-buckets
           :let [ds (by-bucket label)]
           :when (seq ds)]
       [label
        (str (count ds))
        (str/join ", " (for [[k n] (sort-by val > (frequencies (map :kind ds)))]
                         (str (name k) "=" n)))]))))

(defn- report-access-notes! [rows]
  (say! "\n=== WHO LAST TOUCHED THEM (top 20 access notes) ===")
  (let [notes (frequencies (keep :access-note rows))]
    (if (empty? notes)
      (say! "(no dataset in the project has an access note)")
      (print-table!
       ["count" "access note"]
       (for [[note n] (take 20 (sort-by val > notes))]
         [(str n) (str/join " " (take 12 (str/split note #"\s+")))])))))

(defn- report-listing! [rows]
  (say! "\n=== FULL LISTING (" (count rows) " datasets) ===")
  (print-table!
   ["kind" "dataset" "created-days" "modified-days" "accessed-days" "reapable" "access note"]
   (for [{:keys [dataset-id kind created-hours modified-hours accessed-hours access-note] :as row}
         (sort-by (juxt (comp name :kind) :dataset-id) rows)]
     [(name kind)
      dataset-id
      (days created-hours)
      (days modified-hours)
      (days accessed-hours)
      (if (reapable? row) "YES" "")
      (str/join " " (take 12 (str/split (or access-note "-") #"\s+")))])))

(defn- explicitly-requested?
  "Whether this run asked for the report by name.

  The drivers workflow has no input for arbitrary environment variables, so its `tests` input - which arrives as
  `ONLY_TESTS` - is the only signal separating `someone dispatched this on purpose` from `this namespace happened to
  be on the test path`. Without the check, every BigQuery job in CI would scan the whole project and print thousands
  of lines nobody asked for."
  []
  (str/includes? (or (System/getenv "ONLY_TESTS") "") "dataset-inventory"))

(deftest report-dataset-inventory-test
  (mt/test-driver :bigquery-cloud-sdk
    (if-not (explicitly-requested?)
      (say! "[bq-inventory] skipped: set the drivers workflow `tests` input to this var to run the report.")
      (let [rows (vec (inventory))]
        (say! "\n=== BigQuery dataset inventory for project " (bigquery.tx/project-id) " ===")
        (say! "Datasets found: " (count rows))
        (say! "Reap threshold used for the `reapable` column: " reap-after-days " days")
        (say! "Note: an unqualified INFORMATION_SCHEMA query only sees the US region, same as the reaper's own query.")
        (report-by-kind! rows)
        (report-activity! rows)
        (report-access-notes! rows)
        (report-listing! rows)
        (say! "\n[bq-inventory] end of report. Nothing was deleted.")
        (is (pos? (count rows))
            "expected the test project to contain at least one dataset")))))
