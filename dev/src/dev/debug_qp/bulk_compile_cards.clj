(ns dev.debug-qp.bulk-compile-cards
  (:require
   [clojure.java.io :as io]
   [clojure.java.shell :as shell]
   [clojure.string :as str]
   [metabase.driver.sql.util :as sql.u]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent Executors Callable)))

(set! *warn-on-reflection* true)

(defn- get-card-ids [engine limit]
  (t2/query {:select [:rc.id :rc.database_id]
             :from   [[:report_card :rc]]
             :join   [[:metabase_database :md] [:= :rc.database_id :md.id]]
             :where  [:and [:= :md.engine engine] [:not= :rc.query_type "native"]]
             :order-by [[:md.id :asc] [:rc.id :asc]]
             :limit  limit}))

(defn- get-native-card-ids [engine limit]
  (t2/query {:select [:rc.id :rc.database_id]
             :from   [[:report_card :rc]]
             :join   [[:metabase_database :md] [:= :rc.database_id :md.id]]
             :where  [:and [:= :md.engine engine] [:= :rc.query_type "native"]]
             :order-by [[:md.id :asc] [:rc.id :asc]]
             :limit  limit}))

(defn- save-card-compilation-results
  [card-ids output-file]
  (let [pool    (Executors/newFixedThreadPool 8)
        futures (mapv (fn [{card-id :id db-id :database_id}]
                        (.submit pool ^Callable
                                 (fn []
                                   (try
                                     (let [card-query (t2/select-one-fn :dataset_query :model/Card card-id)
                                           {:keys [query params error]} (try
                                                                          (qp.compile/compile card-query)
                                                                          (catch Throwable e
                                                                            {:error (ex-message e)}))]
                                       (cond-> {:db_id   db-id
                                                :card_id card-id
                                                :query  query
                                                :params params}
                                         error (assoc :error error)))
                                     (catch Throwable e
                                       {:db_id db-id
                                        :card_id card-id
                                        :error (ex-message e)})))))
                      card-ids)]
    (try
      (with-open [w (io/writer (str "dev/src/dev/debug_qp/" output-file) :append true)]
        (doseq [f futures]
          (.write w (json/encode (.get f)))
          (.write w "\n")))
      (finally
        (.shutdown pool)))))

(defn- load-jsonl-by-card-id [filepath]
  (with-open [rdr (io/reader filepath)]
    (into {}
          (comp (map str/trim)
                (remove str/blank?)
                (map #(json/decode % keyword))
                (map (fn [data] [(:card_id data) data])))
          (line-seq rdr))))

(defn- get-compilation-diffs [diff-folder mbql4-file mbql5-file]
  (let [_ (.mkdirs (io/file diff-folder))
        mbql4-results (load-jsonl-by-card-id mbql4-file)
        mbql5-results (load-jsonl-by-card-id mbql5-file)
        _ (assert (= (set (keys mbql4-results)) (set (keys mbql5-results))))
        card-ids (sort (keys mbql4-results))
        query-diffs (vec
                     (for [card-id card-ids
                           :let [mbql4-sql (get-in mbql4-results [card-id :query] "")
                                 mbql5-sql (get-in mbql5-results [card-id :query] "")]
                           :when (not= mbql4-sql mbql5-sql)]
                       [card-id (sql.u/format-sql :sql mbql4-sql) (sql.u/format-sql :sql mbql5-sql)]))
        error-diffs (vec
                     (for [card-id card-ids
                           :let [mbql4-err (get-in mbql4-results [card-id :error])
                                 mbql5-err (get-in mbql5-results [card-id :error])]
                           :when (not= mbql4-err mbql5-err)]
                       [card-id mbql4-err mbql5-err]))]
    (when (seq query-diffs)
      (with-open [^java.io.Writer diff-file (io/writer (io/file diff-folder "query_diffs.txt"))]
        (doseq [[card-id mbql4-sql mbql5-sql] query-diffs]
          (doseq [[version sql] [["mbql4" mbql4-sql] ["mbql5" mbql5-sql]]]
            (spit (io/file diff-folder (str "card_" card-id "_" version ".sql"))
                  (str sql "\n")))
          (let [result (shell/sh "diff" "-w" "-u"
                                 (str (io/file diff-folder (str "card_" card-id "_mbql4.sql")))
                                 (str (io/file diff-folder (str "card_" card-id "_mbql5.sql"))))]
            (.write diff-file (:out result))
            (.write diff-file "\n")))))
    (when (seq error-diffs)
      (with-open [^java.io.Writer f (io/writer (io/file diff-folder "error_diffs.jsonl"))]
        (doseq [[card-id mbql4-err mbql5-err] error-diffs]
          (.write f (str (json/encode {:card_id card-id}) "\n"))
          (.write f (str (json/encode {:mbql4_error mbql4-err}) "\n"))
          (.write f (str (json/encode {:mbql5_error mbql5-err}) "\n")))))))

(comment

  (def h2-card-ids (get-card-ids "h2" 3800))

  (time
   (save-card-compilation-results h2-card-ids "h2_mbql5_results.jsonl"))

  (get-compilation-diffs
   "dev/src/dev/debug_qp/h2_4_to_5"
   "dev/src/dev/debug_qp/h2_mbql4_results.jsonl"
   "dev/src/dev/debug_qp/h2_mbql5_results.jsonl")

  (def postgres-card-ids (get-card-ids "postgres" 16600))

  (time
   (save-card-compilation-results postgres-card-ids "postgres_mbql5_results.jsonl"))

  (get-compilation-diffs
   "dev/src/dev/debug_qp/postgres_4_to_5"
   "dev/src/dev/debug_qp/postgres_mbql4_results.jsonl"
   "dev/src/dev/debug_qp/postgres_mbql5_results.jsonl")

  (def redshift-card-ids (get-card-ids "redshift" 16600))

  (time
   (save-card-compilation-results redshift-card-ids "redshift_mbql5_results.jsonl"))

  (get-compilation-diffs
   "dev/src/dev/debug_qp/redshift_4_to_5"
   "dev/src/dev/debug_qp/redshift_mbql4_results.jsonl"
   "dev/src/dev/debug_qp/redshift_mbql5_results.jsonl")

  (time
   (save-card-compilation-results redshift-card-ids "redshift_mock_quotes_mbql5_results.jsonl"))

  (get-compilation-diffs
   "dev/src/dev/debug_qp/redshift_5_to_mock_quotes5"
   "dev/src/dev/debug_qp/redshift_mbql5_results.jsonl"
   "dev/src/dev/debug_qp/redshift_mock_quotes_mbql5_results.jsonl")

  (get-compilation-diffs
   "dev/src/dev/debug_qp/redshift_4_to_mock_quotes5"
   "dev/src/dev/debug_qp/redshift_mbql4_results.jsonl"
   "dev/src/dev/debug_qp/redshift_mock_quotes_mbql5_results.jsonl"))

(comment

  (def h2-native-card-ids (get-native-card-ids "h2" 3800))

  (time
   (save-card-compilation-results h2-native-card-ids "h2_native_mbql5_results.jsonl"))

  (get-compilation-diffs
   "dev/src/dev/debug_qp/h2_native_4_to_5"
   "dev/src/dev/debug_qp/h2_native_mbql4_results.jsonl"
   "dev/src/dev/debug_qp/h2_native_mbql5_results.jsonl")

  (def postgres-native-card-ids (get-native-card-ids "postgres" 16600))

  (time
   (save-card-compilation-results postgres-native-card-ids "postgres_native_mbql5_results.jsonl"))

  (get-compilation-diffs
   "dev/src/dev/debug_qp/postgres_native_4_to_5"
   "dev/src/dev/debug_qp/postgres_native_mbql4_results.jsonl"
   "dev/src/dev/debug_qp/postgres_native_mbql5_results.jsonl")

  (def redshift-native-card-ids (get-native-card-ids "redshift" 16600))

  (time
   (save-card-compilation-results redshift-native-card-ids "redshift_native_mbql5_results.jsonl"))

  (get-compilation-diffs
   "dev/src/dev/debug_qp/redshift_native_4_to_5"
   "dev/src/dev/debug_qp/redshift_native_mbql4_results.jsonl"
   "dev/src/dev/debug_qp/redshift_native_mbql5_results.jsonl"))
