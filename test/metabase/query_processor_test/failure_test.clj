(ns metabase.query-processor-test.failure-test
  "Tests for how the query processor as a whole handles failures."
  (:require [metabase.query-processor :as qp]
            [metabase.query-processor.interface :as qp.i]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.util.log :as tu.log]
            [metabase.util.schema :as su]
            [schema.core :as s]))

(defn- bad-query []
  {:database (data/id)
   :type     :query
   :query    {:source-table (data/id :venues)
              :fields       [["datetime_field" (data/id :venues :id) "MONTH"]]}})

(defn- bad-query:preprocessed []
  {:database            (data/id)
   :type                :query
   :query               {:source-table (data/id :venues)
                         :fields       [[:datetime-field [:field-id (data/id :venues :id)] :month]]
                         :limit        qp.i/absolute-max-results}
   :preprocessing-level 1
   :driver              :h2})

(def ^:private bad-query:native
  {:query  (str "SELECT parsedatetime(formatdatetime(\"PUBLIC\".\"VENUES\".\"ID\", 'yyyyMM'), 'yyyyMM') AS \"ID\" "
                "FROM \"PUBLIC\".\"VENUES\" "
                "LIMIT 1048576")
   :params nil})

;; running a bad query via `process-query` should return stacktrace, query, preprocessed query, and native query
(tu/expect-schema
  {:status       (s/eq :failed)
   :class        (s/eq Exception)
   :error        s/Str
   :stacktrace   [su/NonBlankString]
   ;; `:database` is removed by the catch-exceptions middleware for historical reasons
   :query        (s/eq (dissoc (bad-query) :database))
   :preprocessed (s/eq (bad-query:preprocessed))
   :native       (s/eq bad-query:native)
   :cause        {:class (s/eq org.h2.jdbc.JdbcSQLException)
                  :error #"Cannot parse \"TIMESTAMP\" constant \"1\"; SQL statement:.*"
                  :cause {:class (s/eq java.lang.IllegalArgumentException)
                          :error (s/eq "1")}}}
  (tu.log/suppress-output
    (qp/process-query (bad-query))))

;; running via `process-query-and-save-execution!` should return similar info and a bunch of other nonsense too
(tu/expect-schema
  {:database_id  (s/eq (data/id))
   :started_at   java.util.Date
   :json_query   (s/eq (assoc-in (bad-query) [:middleware :userland-query?] true))
   :native       (s/eq bad-query:native)
   :status       (s/eq :failed)
   :stacktrace   [su/NonBlankString]
   :context      (s/eq :question)
   :error        su/NonBlankString
   :row_count    (s/eq 0)
   :running_time (s/constrained s/Int (complement neg?))
   :preprocessed (s/eq (assoc-in (bad-query:preprocessed) [:middleware :userland-query?] true))
   :data         {:rows (s/eq [])
                  :cols (s/eq [])}}
  (tu.log/suppress-output
    (qp/process-query-and-save-execution! (bad-query) {:context :question})))
