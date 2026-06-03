(ns dev.debug-qp.bulk-compile-cards
  (:require
   [clojure.java.io :as io]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent Executors Callable)))

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
                                       {:card-id card-id
                                        :error (ex-message e)})))))
                      card-ids)]
    (try
      (with-open [w (io/writer output-file :append true)]
        (doseq [f futures]
          (.write w (json/encode (.get f)))
          (.write w "\n")))
      (finally
        (.shutdown pool)))))

(defn- get-card-rows [card-id]
  (let [{:keys [dataset_query]} (t2/select-one :model/Card card-id)]
    (mt/rows (qp/process-query dataset_query))))

(defn- get-card-ids [engine limit]
  (t2/query {:select [:rc.id :rc.database_id]
             :from   [[:report_card :rc]]
             :join   [[:metabase_database :md] [:= :rc.database_id :md.id]]
             :where  [:and [:= :md.engine engine] [:not= :rc.query_type "native"]]
             :order-by [[:md.id :asc] [:rc.id :asc]]
             :limit  limit}))

(comment

  (def h2-card-ids (get-card-ids "h2" 3800))

  (time
   (save-card-compilation-results h2-card-ids "h2_mbql5_results.jsonl"))

  (def postgres-card-ids (get-card-ids "postgres" 16600))

  (time
   (save-card-compilation-results postgres-card-ids "postgres_mbql5_results.jsonl")))
