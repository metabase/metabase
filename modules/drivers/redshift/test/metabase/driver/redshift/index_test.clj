(ns ^:mb/driver-tests metabase.driver.redshift.index-test
  "Tests for the Redshift inline index driver methods (Index Manager, milestone 0): `supported-index-methods` and
  the sortkey rendering in `compile-transform`. These are pure rendering/capability checks and need no connection."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]))

(deftest ^:parallel feature-flags-test
  (testing "Redshift inlines hints into the CTAS and does not create them post-hoc"
    (is (true? (driver/database-supports? :redshift :index/inline-on-ctas nil)))
    (is (false? (driver/database-supports? :redshift :index/post-ctas-create nil)))))

(deftest ^:parallel supported-index-methods-test
  (testing "Redshift advertises inline sortkeys"
    (is (= {:sortkey {:lifecycle :ctas-inline}}
           (driver/supported-index-methods :redshift nil)))))

(def ^:private render-cases
  "Each case: a sortkey hint passed to `compile-transform` and the CTAS SQL it should render. Add a row to cover a new
  style or column shape."
  [{:label        "compound sortkey, single column"
    :output-table :public/events
    :indexes      [{:kind :sortkey :style :compound :columns [{:name "created_at"}]}]
    :expected-sql "CREATE TABLE \"public\".\"events\" COMPOUND SORTKEY (\"created_at\") AS SELECT 1"}
   {:label        "interleaved sortkey, multiple columns"
    :output-table :events
    :indexes      [{:kind :sortkey :style :interleaved :columns [{:name "a"} {:name "b"}]}]
    :expected-sql "CREATE TABLE \"events\" INTERLEAVED SORTKEY (\"a\", \"b\") AS SELECT 1"}
   {:label        "defaults to compound when style is omitted"
    :output-table :events
    :indexes      [{:kind :sortkey :columns [{:name "a"}]}]
    :expected-sql "CREATE TABLE \"events\" COMPOUND SORTKEY (\"a\") AS SELECT 1"}
   {:label        "no sortkey hint delegates to the base CTAS"
    :output-table :events
    :indexes      []
    :expected-sql "CREATE TABLE \"events\" AS SELECT 1"}])

(deftest ^:parallel compile-transform-test
  (doseq [{:keys [label output-table indexes expected-sql]} render-cases]
    (testing label
      (is (= [expected-sql ["p"]]
             (driver/compile-transform :redshift {:output-table output-table
                                                  :query        {:query "SELECT 1" :params ["p"]}
                                                  :indexes      indexes}))))))
