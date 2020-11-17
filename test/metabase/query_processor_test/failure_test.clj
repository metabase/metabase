(ns metabase.query-processor-test.failure-test
  "Tests for how the query processor as a whole handles failures."
  (:require [clojure.test :refer :all]
            [metabase.query-processor :as qp]
            [metabase.query-processor.interface :as qp.i]
            [metabase.test.data :as data]
            [metabase.test.util.log :as tu.log]
            [metabase.util.schema :as su]
            [schema.core :as s]))

(defn- bad-query []
  {:database (data/id)
   :type     :query
   :query    {:source-table (data/id :venues)
              :fields       [["datetime_field" (data/id :venues :id) "MONTH"]]}})

(defn- bad-query-schema []
  {:database (s/eq (data/id))
   :type     (s/eq :query)
   :query    {:source-table (s/eq (data/id :venues))
              :fields       (s/eq [["datetime_field" (data/id :venues :id) "MONTH"]])}})

(defn- bad-query-preprocessed-schema []
  {:database                (s/eq (data/id))
   :type                    (s/eq :query)
   :query                   {:source-table (s/eq (data/id :venues))
                             :fields       (s/eq [[:datetime-field [:field-id (data/id :venues :id)] :month]])
                             :limit        (s/eq qp.i/absolute-max-results)}
   (s/optional-key :driver) (s/eq :h2)
   s/Keyword                s/Any})

(def ^:private bad-query-native-schema
  {:query  (s/eq (str "SELECT parsedatetime(formatdatetime(\"PUBLIC\".\"VENUES\".\"ID\", 'yyyyMM'), 'yyyyMM') AS \"ID\" "
                      "FROM \"PUBLIC\".\"VENUES\" "
                      "LIMIT 1048576"))
   :params (s/eq nil)})

(deftest process-userland-query-test
  (testing "running a bad query via `process-query` should return stacktrace, query, preprocessed query, and native query"
    (tu.log/suppress-output
      (is (schema= {:status       (s/eq :failed)
                    :class        Class
                    :error        s/Str
                    :stacktrace   [su/NonBlankString]
                    ;; `:database` is removed by the catch-exceptions middleware for historical reasons
                    :json_query   (bad-query-schema)
                    :preprocessed (bad-query-preprocessed-schema)
                    :native       bad-query-native-schema
                    s/Keyword     s/Any}
                   (qp/process-userland-query (bad-query)))))))

(deftest process-query-and-save-execution-test
  (testing "running via `process-query-and-save-execution!` should return similar info and a bunch of other nonsense too"
    (tu.log/suppress-output
      (is (schema= {:database_id  (s/eq (data/id))
                    :started_at   java.time.ZonedDateTime
                    :json_query   (bad-query-schema)
                    :native       bad-query-native-schema
                    :status       (s/eq :failed)
                    :class        Class
                    :stacktrace   [su/NonBlankString]
                    :context      (s/eq :question)
                    :error        su/NonBlankString
                    :row_count    (s/eq 0)
                    :running_time (s/constrained s/Int (complement neg?))
                    :preprocessed (bad-query-preprocessed-schema)
                    :data         {:rows (s/eq [])
                                   :cols (s/eq [])}
                    s/Keyword     s/Any}
                   (qp/process-query-and-save-execution! (bad-query) {:context :question}))))))
