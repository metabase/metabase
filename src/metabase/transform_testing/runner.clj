(ns metabase.transform-testing.runner
  "Runs a test suite: creates its inputs and the transform output as temp tables on one connection, checks its
  expectations there, and drops the temp tables."
  (:require
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.transform-testing.compile :as transform-testing.compile]
   [metabase.transform-testing.db :as transform-testing.db]
   [metabase.transform-testing.expectations :as transform-testing.expectations]
   [metabase.transform-testing.schema :as transform-testing.schema]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(mu/defn- create-temp-table!
  "Creates the temp table `table` from the compiled `query` on `conn`."
  [driver :- :keyword
   conn   :- :some
   table  :- :string
   query  :- ::transform-testing.compile/compiled-query]
  (driver/execute-on-connection! driver conn (driver/compile-create-temp-table driver {:table table, :query query})))

(mu/defn- drop-temp-table!
  "Drops the temp table `table` on `conn` if it exists."
  [driver :- :keyword
   conn   :- :some
   table  :- :string]
  (let [[sql & params] (driver/compile-drop-table driver table)]
    (driver/execute-on-connection! driver conn [sql params])))

(mu/defn run-test-suite! :- ::transform-testing.schema/run-result
  "Runs the test suite `suite` against temp tables and returns whether all of its expectations passed."
  [{:keys [transform_id inputs expectations]} :- ::transform-testing.schema/transform-test-suite]
  (let [transform    (api/check-404 (transform-testing.db/transform transform_id))
        _            (api/check-400 (transforms-base.u/query-transform? transform)
                                    (tru "Only query transforms can be tested."))
        database     (api/check-404 (transform-testing.db/database
                                     (transforms-base.u/transform-source-database transform)))
        driver       (keyword (:engine database))
        _            (api/check-400 (driver.u/supports? driver :transforms/testing database)
                                    (tru "The database of this transform does not support transform testing."))
        input-tables (mapv (fn [_input] (driver/temp-table-name driver)) inputs)
        output-table (driver/temp-table-name driver)
        replacements (transform-testing.compile/table-replacements driver transform inputs input-tables output-table)]
    (driver/do-with-test-connection
     driver
     database
     (fn [conn]
       (try
         (doseq [[table input] (map vector input-tables inputs)]
           (create-temp-table! driver conn table (transform-testing.compile/compile-input driver input)))
         (create-temp-table! driver conn output-table
                             (transform-testing.compile/compile-transform driver transform replacements))
         (let [context  {:driver       driver
                         :conn         conn
                         :output-table output-table
                         :replacements replacements}
               statuses (mapv #(transform-testing.expectations/check-expectation context %) expectations)]
           {:status (if (every? #{:passed} statuses) :passed :failed)})
         (finally
           (doseq [table (conj input-tables output-table)]
             (drop-temp-table! driver conn table))))))))
