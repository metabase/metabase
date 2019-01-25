(ns metabase.query-processor-test.failure-test
  "Tests for how the query processor as a whole handles failures."
  (:require [expectations :refer [expect]]
            [metabase.query-processor :as qp]
            [metabase.query-processor.interface :as qp.i]
            [metabase.test.data :as data]))

(defn- bad-query []
  {:database (data/id)
   :type     :query
   :query    {:source-table (data/id :venues)
              :fields       [["datetime_field" (data/id :venues :id) "MONTH"]]}})

(defn- bad-query:preprocessed []
  {:database (data/id)
   :type     :query
   :query    {:source-table (data/id :venues)
              :fields       [[:datetime-field [:field-id (data/id :venues :id)] :month]]
              :limit        qp.i/absolute-max-results}
   :driver   :h2
   :settings {}})

(def ^:private bad-query:native
  {:query  (str "SELECT parsedatetime(formatdatetime(\"PUBLIC\".\"VENUES\".\"ID\", 'yyyyMM'), 'yyyyMM') AS \"ID\" "
                "FROM \"PUBLIC\".\"VENUES\" "
                "LIMIT 1048576")
   :params nil})

(def ^:private ^{:arglists '([stacktrace])} valid-stacktrace? (every-pred seq (partial every? (every-pred string? seq))))

;; running a bad query via `process-query` should return stacktrace, query, preprocessed query, and native query
(expect
  {:status       :failed
   :class        java.util.concurrent.ExecutionException
   :error        true
   :stacktrace   true
   ;; `:database` is removed by the catch-exceptions middleware for historical reasons
   :query        (dissoc (bad-query) :database)
   :preprocessed (bad-query:preprocessed)
   :native       bad-query:native}
  (-> (qp/process-query (bad-query))
      (update :error (every-pred string? seq))
      (update :stacktrace valid-stacktrace?)))

;; running via `process-query-and-save-execution!` should return similar info and a bunch of other nonsense too
(expect
  {:database_id  (data/id)
   :started_at   true
   :json_query   (bad-query)
   :native       bad-query:native
   :status       :failed
   :stacktrace   true
   :context      :question
   :error        true
   :row_count    0
   :running_time true
   :preprocessed (bad-query:preprocessed)
   :data         {:rows [], :cols [], :columns []}}
  (-> (qp/process-query-and-save-execution! (bad-query) {:context :question})
      (update :error (every-pred string? seq))
      (update :started_at (partial instance? java.util.Date))
      (update :stacktrace valid-stacktrace?)
      (update :running_time (complement neg?))))
