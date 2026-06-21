(ns metabase.starrez.export
  "Orchestrates StarRez data export: fetch (tables and reports) → CSV → upload to blob storage."
  (:require
   [clojure.data.csv :as csv]
   [clojure.string :as str]
   [metabase.starrez.client :as starrez.client]
   [metabase.starrez.db :as starrez.db]
   [metabase.starrez.settings :as starrez.settings]
   [metabase.starrez.storage :as starrez.storage]
   [metabase.util.log :as log])
  (:import
   (java.io StringWriter)
   (java.time LocalDateTime)
   (java.time.format DateTimeFormatter)))

(set! *warn-on-reflection* true)

(def ^:private ^DateTimeFormatter timestamp-fmt
  (DateTimeFormatter/ofPattern "yyyy-MM-dd_HH-mm-ss"))

(defn- timestamp-str []
  (.format (LocalDateTime/now) timestamp-fmt))

(defn- records->csv
  "Convert a sequence of maps to a CSV string, sorted by `sort-field` if present in the records.
  The first row is the header row derived from the keys of the first record."
  [records sort-field]
  (when (seq records)
    (let [k        (keyword sort-field)
          sorted   (if (and sort-field (contains? (first records) k))
                     (sort-by (fn [r] (str (get r k))) records)
                     records)
          headers  (keys (first sorted))
          rows     (map (fn [r] (map #(str (get r %)) headers)) sorted)
          writer   (StringWriter.)]
      (csv/write-csv writer (cons (map name headers) rows))
      (str writer))))

(defn export-table
  "Fetch `table` from StarRez, convert to sorted CSV, and upload to Azure Blob Storage.
  Returns {:kind :table :name :blob_name :records_count :success}."
  [table]
  (log/infof "Starting StarRez export for table: %s" table)
  (let [sort-field (starrez.settings/starrez-sort-field)
        sas-url    (starrez.settings/starrez-blob-sas-url)
        records    (starrez.client/fetch-table-data table)
        csv-str    (records->csv records sort-field)
        blob-name  (str "starrez_" table "_" (timestamp-str) ".csv")
        success?   (if (seq csv-str)
                     (starrez.storage/upload-export sas-url blob-name csv-str)
                     (do (log/warnf "No records returned for table %s — skipping upload" table)
                         false))]
    (when success?
      (let [keep-n (starrez.settings/starrez-keep-versions)]
        (starrez.storage/cleanup-old-exports sas-url table keep-n)))
    {:kind          :table
     :name          table
     :blob_name     blob-name
     :records_count (count records)
     :success       success?}))

(defn export-report
  "Fetch `report-id` (or report name) from StarRez as CSV and upload to Azure Blob Storage.
  Returns {:kind :report :name :blob_name :success}."
  [report-id]
  (log/infof "Starting StarRez export for report: %s" report-id)
  (let [sas-url   (starrez.settings/starrez-blob-sas-url)
        report    (starrez.client/fetch-report-csv report-id)
        csv-str   (:body report)
        prefix    (str "report_" report-id)
        blob-name (str "starrez_" prefix "_" (timestamp-str) ".csv")
        error     (or (:error report)
                      (when-not (seq csv-str)
                        (str "No CSV body for report " report-id)))
        success?  (if (and (:ok report) (seq csv-str))
                    (starrez.storage/upload-export sas-url blob-name csv-str)
                    (do (log/warnf "%s — skipping upload" error)
                        false))]
    (when success?
      (let [keep-n (starrez.settings/starrez-keep-versions)]
        (starrez.storage/cleanup-old-exports sas-url prefix keep-n)))
    (cond-> {:kind       :report
             :name       report-id
             :blob_name  blob-name
             :success    success?
             :csv_body   csv-str}
      (and (not success?) error) (assoc :error error))))

(defn- split-csv-setting [s]
  (->> (str/split (or s "") #",")
       (map str/trim)
       (remove str/blank?)))

(defn- option-or-setting [option setting-fn]
  (if (some? option)
    option
    (setting-fn)))

(defonce ^:private export-running? (atom false))

(defn export-in-progress?
  "Returns true if an export is currently running."
  []
  @export-running?)

(defn- successful-blob-files
  "From a vector of export result maps, build {name blob-name} for items that succeeded."
  [results]
  (into {} (for [{:keys [success name blob_name]} results
                 :when success]
             [name blob_name])))

(defn- successful-report-blob-files
  "Build one {report-id blob-name} map per successful report export."
  [results]
  (->> results
       (filter #(and (:success %) (= (:kind %) :report)))
       (mapv (fn [{:keys [name blob_name]}] {name blob_name}))))

(defn- successful-table-blob-files
  "Build one combined {table-name blob-name} map for successful table exports."
  [results]
  (successful-blob-files (filter #(= (:kind %) :table) results)))

(defn- record-export-snapshots!
  "Record table exports as one snapshot and each report export as its own snapshot.
  Returns the ids of the created snapshot rows."
  [results]
  (let [table-files  (successful-table-blob-files results)
        report-files (successful-report-blob-files results)]
    (filterv some?
             (into (cond-> []
                     (seq table-files) (conj (starrez.db/record-export-week! table-files)))
                   (map starrez.db/record-export-week!)
                   report-files))))

(defn- public-export-result [result]
  (dissoc result :csv_body))

(defn run-export
  "Export all configured StarRez tables and reports to blob storage,
  then record snapshots and cumulatively merge report rows by `booking_id`.
  `export-tables` and `export-reports` can override the saved settings for
  manual exports. Blank overrides are respected.
  When `include-historical-reports?` is true, previously successful report IDs
  keep getting refreshed even if removed from the current setting.
  Returns {:results [...] :snapshots [...] :merge ...}, or {:error ...} if another export is in progress.
  Only one export may run at a time."
  ([]
   (run-export {:include-historical-reports? false}))
  ([{:keys [include-historical-reports? export-tables export-reports]}]
   (if-not (compare-and-set! export-running? false true)
     {:error "An export is already in progress. Wait for it to finish."}
     (try
       (let [tables             (split-csv-setting
                                 (option-or-setting export-tables starrez.settings/starrez-export-tables))
             configured-reports (split-csv-setting
                                 (option-or-setting export-reports starrez.settings/starrez-export-reports))
             reports            (if include-historical-reports?
                                  (starrez.db/report-ids-for-export configured-reports)
                                  configured-reports)
             results            (into (mapv export-table tables)
                                      (mapv export-report reports))
             snapshot-ids       (record-export-snapshots! results)]
         {:results   (mapv public-export-result results)
          :snapshots snapshot-ids
          :merge     (when (seq reports)
                       (starrez.db/merge-report-exports! reports results))})
       (finally
         (reset! export-running? false))))))
