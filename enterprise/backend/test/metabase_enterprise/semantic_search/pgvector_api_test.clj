(ns metabase-enterprise.semantic-search.pgvector-api-test
  (:require
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [metabase-enterprise.semantic-search.dlq :as semantic.dlq]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.indexer :as semantic.indexer]
   [metabase-enterprise.semantic-search.pgvector-api :as semantic.pgvector-api]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import (java.io Closeable)
           (java.time Duration)))

(set! *warn-on-reflection* true)

(use-fixtures :once #'semantic.tu/once-fixture)

;; NOTE: isolation tests are absent, in prod there is only one index-metadata

(deftest init-semantic-search!-test
  (let [pgvector       (semantic.env/get-pgvector-datasource!)
        index-metadata (semantic.tu/unique-index-metadata)
        model1         semantic.tu/mock-embedding-model
        model2         (assoc semantic.tu/mock-embedding-model :model-name "embed-harder")
        sut*           semantic.pgvector-api/init-semantic-search!
        cleanup        (fn [_] (semantic.tu/cleanup-index-metadata! pgvector index-metadata))
        sut            #(semantic.tu/closeable (apply sut* %&) cleanup)]
    (with-open [index-ref ^Closeable (sut pgvector index-metadata model1)]
      (testing "sets up active index for model1"
        (let [active-state (semantic.index-metadata/get-active-index-state pgvector index-metadata)]
          (is (= @index-ref (:index active-state)))
          (is (= model1 (:embedding-model (:index active-state))))
          (is (= (:model-name model1) (:model_name (:metadata-row active-state))))
          (testing "dlq is created"
            (is (semantic.tu/table-exists-in-db? (semantic.dlq/dlq-table-name-kw index-metadata (:id (:metadata-row active-state))))))
          (testing "idempotent"
            (let [new-index @(sut pgvector index-metadata model1)]
              (is (= @index-ref new-index))
              (is (= active-state (semantic.index-metadata/get-active-index-state pgvector index-metadata)))))))
      (testing "switch to model1"
        (let [new-index    @(sut pgvector index-metadata model2)
              active-state (semantic.index-metadata/get-active-index-state pgvector index-metadata)]
          (is (= model2 (:embedding-model new-index)))
          (is (= new-index (:index active-state)))
          (testing "new dlq is created"
            (is (semantic.tu/table-exists-in-db? (semantic.dlq/dlq-table-name-kw index-metadata (:id (:metadata-row active-state)))))))
        (testing "model1 index still exists"
          (is (=? {:index              {:embedding-model model1}
                   :active             false
                   :index-table-exists true}
                  (semantic.index-metadata/find-compatible-index! pgvector index-metadata model1))))
        (testing "switch back!"
          (let [new-index    @(sut pgvector index-metadata model1)
                active-state (semantic.index-metadata/get-active-index-state pgvector index-metadata)]
            (is (= model1 (:embedding-model new-index)))
            (is (= new-index (:index active-state)))
            (testing "model2 index still exists"
              (is (=? {:index              {:embedding-model model2}
                       :active             false
                       :index-table-exists true}
                      (semantic.index-metadata/find-compatible-index! pgvector index-metadata model2))))))))))

(deftest init-recreates-missing-index-table-test
  (let [pgvector       (semantic.env/get-pgvector-datasource!)
        index-metadata (semantic.tu/unique-index-metadata)
        model1         semantic.tu/mock-embedding-model
        sut*           semantic.pgvector-api/init-semantic-search!
        cleanup        (fn [_] (semantic.tu/cleanup-index-metadata! pgvector index-metadata))
        sut            #(semantic.tu/closeable (apply sut* %&) cleanup)]
    (with-open [_ ^Closeable (sut pgvector index-metadata model1)]
      (let [index (:index (semantic.index-metadata/find-compatible-index! pgvector index-metadata model1))]
        (testing "Base: index table exists after initialization"
          (is (true? (@#'semantic.index-metadata/index-table-exists? pgvector index))))
        (semantic.index/drop-index-table! pgvector index)
        (testing "Index table was dropped"
          (is (false? (@#'semantic.index-metadata/index-table-exists? pgvector index))))
        (testing "Initialization re-creates missing index table"
          (semantic.pgvector-api/init-semantic-search! pgvector index-metadata model1)
          (is (true? (@#'semantic.index-metadata/index-table-exists? pgvector index))))))))

(defn- open-semantic-search! ^Closeable [pgvector index-metadata embedding-model]
  (semantic.tu/closeable
   (semantic.pgvector-api/init-semantic-search! pgvector index-metadata embedding-model)
   (fn [_]
     (semantic.tu/cleanup-index-metadata! pgvector index-metadata))))

(defn- test-not-initialized [sut & args]
  (testing "throws if not initialized"
    ;; not defined specific exception behaviour here yet, but best not to return empty or something silly like that
    (is (thrown? Exception (apply sut args)))))

(deftest index-documents!-test
  (let [pgvector       (semantic.env/get-pgvector-datasource!)
        index-metadata (semantic.tu/unique-index-metadata)
        model1         semantic.tu/mock-embedding-model
        model2         (assoc semantic.tu/mock-embedding-model :model-name "embedagain")
        sut            semantic.pgvector-api/index-documents!]
    (test-not-initialized sut pgvector index-metadata model1)
    (with-open [index-ref (open-semantic-search! pgvector index-metadata model1)]
      ;; no specific behaviour, only proxies the active index to the index search
      (testing "is only a proxy for the active index call"
        (let [{:keys [proxy calls]} (semantic.tu/spy semantic.index/upsert-index!)
              documents (semantic.tu/mock-documents)]
          (with-redefs [semantic.index/upsert-index! proxy]
            (testing "check proxies correct args and ret is untouched"
              (let [ret (sut pgvector index-metadata documents)]
                (is (= [{:args [pgvector @index-ref documents]
                         :ret  ret}]
                       @calls))))

            (testing "check proxies after switch"
              (reset! calls [])
              (let [new-index (semantic.pgvector-api/init-semantic-search! pgvector index-metadata model2)
                    ret       (sut pgvector index-metadata documents)]
                (is (= [{:args [pgvector new-index documents]
                         :ret  ret}]
                       @calls))))))))))

(deftest delete-documents!-test
  (let [pgvector       (semantic.env/get-pgvector-datasource!)
        index-metadata (semantic.tu/unique-index-metadata)
        dash           "dashboard"
        card           "card"
        model1         semantic.tu/mock-embedding-model
        model2         (assoc semantic.tu/mock-embedding-model :model-name "embedagain")
        sut            semantic.pgvector-api/delete-documents!
        documents      (semantic.tu/mock-documents)
        {card-ids "card", dash-ids "dashboard"} (u/group-by :model :id documents)]
    (test-not-initialized sut pgvector index-metadata model1)
    (with-open [index-ref (open-semantic-search! pgvector index-metadata model1)]
      ;; no specific behaviour, only proxies the active index to the index search
      (testing "is only a proxy for the active index call"
        (semantic.pgvector-api/index-documents! pgvector index-metadata documents)
        (let [{:keys [calls proxy]} (semantic.tu/spy semantic.index/delete-from-index!)]
          (with-redefs [semantic.index/delete-from-index! proxy]
            (testing "check proxies correct args and ret is untouched"
              (let [ret1 (sut pgvector index-metadata dash dash-ids)
                    ret2 (sut pgvector index-metadata card card-ids)
                    ret3 (sut pgvector index-metadata card dash-ids)
                    ret4 (sut pgvector index-metadata card [])]
                (is (= [{:args [pgvector @index-ref dash dash-ids]
                         :ret  ret1}
                        {:args [pgvector @index-ref card card-ids]
                         :ret  ret2}
                        {:args [pgvector @index-ref card dash-ids]
                         :ret  ret3}
                        {:args [pgvector @index-ref card []]
                         :ret  ret4}]
                       @calls))))
            (testing "check proxies after switch"
              (reset! calls [])
              (let [new-index (semantic.pgvector-api/init-semantic-search! pgvector index-metadata model2)
                    ret       (sut pgvector index-metadata dash dash-ids)]
                (is (= [{:args [pgvector new-index dash dash-ids]
                         :ret  ret}]
                       @calls))))))))))

(deftest query-test
  (semantic.tu/with-indexable-documents!
    (mt/with-dynamic-fn-redefs [semantic.index/model-table-suffix semantic.tu/mock-table-suffix]
      (let [pgvector       (semantic.env/get-pgvector-datasource!)
            index-metadata (semantic.tu/unique-index-metadata)
            model1         semantic.tu/mock-embedding-model
            model2         (assoc semantic.tu/mock-embedding-model :model-name "judge-embedd")
            remove-scores  (fn [rows] (mapv #(dissoc % :score :all-scores) rows)) ; scores have time-sensitives components
            sut*           semantic.pgvector-api/query
            sut            #(remove-scores (:results (mt/as-admin (apply sut* %&)))) ; see notes below about perms
            search-string  "puppy" ; specifics of search will be handled under index tests
            _              (assert (semantic.tu/mock-embeddings search-string)
                                   "search string should have test embedding")
            search         {:search-string search-string}]
        (test-not-initialized sut pgvector index-metadata search)
        (with-open [index-ref (open-semantic-search! pgvector index-metadata model1)]
          (semantic.pgvector-api/index-documents! pgvector index-metadata (vec (search.ingestion/searchable-documents)))
          (testing "search results are the same as direct index query"
            (let [index-results (remove-scores (:results (mt/as-admin (semantic.index/query-index pgvector @index-ref search))))
                  api-results   (sut pgvector index-metadata search)]
              (testing "sanity check the test is setup correctly" (is (seq api-results)))
              (is (= api-results index-results))))
          ;; it would be better to test permissions at a higher level than we currently do, but for now to save time...
          (testing "assumption: permissions are applied at the index query level, check the expected fn is called"
            (let [query-index semantic.index/query-index
                  called      (atom false)]
              (with-redefs [semantic.index/query-index (fn [& args] (reset! called true) (apply query-index args))]
                (sut pgvector index-metadata search)
                (is @called))))
          (testing "same results after reinit"
            (let [current-results (sut pgvector index-metadata search)]
              (semantic.pgvector-api/init-semantic-search! pgvector index-metadata model1)
              (is (= current-results (sut pgvector index-metadata search)))))
          (testing "switching to an empty index"
            (let [current-results (sut pgvector index-metadata search)]
              (semantic.pgvector-api/init-semantic-search! pgvector index-metadata model2)
              ;; sanity
              (is (not= @index-ref (:index (semantic.index-metadata/get-active-index-state pgvector index-metadata))))
              (testing "empty to start but works"
                (is (= [] (sut pgvector index-metadata search))))
              (testing "after indexing returns again"
                (semantic.pgvector-api/index-documents! pgvector index-metadata (vec (search.ingestion/searchable-documents)))
                ;; todo test the results with different mock embeddings to show the embeddings
                ;; can actually change
                (is (seq (sut pgvector index-metadata search))))
              (testing "querying previous index directly still works"
                (is (= current-results (remove-scores (:results (mt/as-admin (semantic.index/query-index pgvector @index-ref search)))))))))
          (testing "throws exception when no active index exists"
            ;; corrupt the control table
            (jdbc/execute! pgvector (sql/format {:delete-from (keyword (:control-table-name index-metadata))}
                                                :quoted true))
            (is (thrown-with-msg? Exception #"No active semantic search index" (sut pgvector index-metadata search)))))))))

(deftest e2e-index-a-sample-db-with-gate-test
  (let [docs            (mt/dataset test-data (vec (search.ingestion/searchable-documents)))
        pgvector        (semantic.env/get-pgvector-datasource!)
        index-metadata  (semantic.tu/unique-index-metadata)
        embedding-model semantic.tu/mock-embedding-model
        open-job-thread (fn [& args]
                          (let [caught-ex (volatile! nil)]
                            (semantic.tu/closeable
                             {:caught-ex caught-ex
                              :thread
                              (doto (Thread.
                                     ^Runnable
                                     (bound-fn*
                                      (fn []
                                        (try
                                          (apply semantic.indexer/quartz-job-run! args)
                                          (catch InterruptedException _)
                                          (catch Throwable t
                                            (vreset! caught-ex t))))))
                                (.setDaemon true)
                                (.start))}
                             (fn [{:keys [^Thread thread]}]
                               (when (.isAlive thread)
                                 (.interrupt thread)
                                 (when-not (.join thread (Duration/ofSeconds 30))
                                   (log/fatal "Indexing loop thread not exiting during test!")))))))]
    (with-redefs [semantic.indexer/sleep                         (fn [_])       ; do not slow down
                  ; important to test poll / paging (not many docs in test-data)
                  semantic.settings/ee-search-indexer-poll-limit (constantly 4)
                  semantic.indexer/lag-tolerance                 Duration/ZERO] ; if too high will slow the test down significantly

      (with-open [index-ref  (open-semantic-search! pgvector index-metadata embedding-model)
                  job-thread ^Closeable (open-job-thread pgvector index-metadata)]
        (let [index @index-ref
              {:keys [caught-ex ^Thread thread]} @job-thread]

          (is (= (frequencies (map :model docs)) (semantic.pgvector-api/gate-updates! pgvector index-metadata docs)))

          (let [max-wait         (+ (System/currentTimeMillis) 1000)
                get-indexed-q    {:select [:model [:model_id :id]] :from [(keyword (:table-name index))]}
                get-indexed      (fn [] (frequencies
                                         (jdbc/execute! pgvector
                                                        (sql/format get-indexed-q :quoted true)
                                                        {:builder-fn jdbc.rs/as-unqualified-lower-maps})))
                expected-indexed (frequencies (distinct (map (fn [{:keys [model id]}]
                                                               {:model model
                                                                :id    (str id)})
                                                             docs)))
                indexed-in-time  (loop [indexed {}]
                                   (cond
                                     (< max-wait (System/currentTimeMillis)) indexed
                                     (= indexed expected-indexed) indexed
                                     :else (recur (get-indexed))))]

            (testing "we indexed all the expected documents"
              (is (= expected-indexed indexed-in-time))))

          (testing "interrupt"
            (.interrupt thread)
            (is (.join thread (Duration/ofSeconds 10)))
            (is (nil? @caught-ex))))))))
