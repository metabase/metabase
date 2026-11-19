(ns metabase.serialization.mbql-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.test-metadata :as meta]
   [metabase.serialization.mbql :as mbql]
   [metabase.serialization.protocol.stub :as protocol.stub]
   [metabase.util.malli.registry :as mr]))

(defn- fake-uuid
  "Deterministic placeholder `:lib/uuid` for tests, e.g. `(fake-uuid 1)` => \"00000000-0000-0000-0000-000000000001\"."
  [n]
  (format "00000000-0000-0000-0000-%012d" n))

(defn- export-one [stubs x]
  (first (mbql/export-mbql (protocol.stub/stub-store stubs) [x])))

(defn- import-one
  ([x]
   (import-one {} x))
  ([stubs x]
   (first (mbql/import-mbql (protocol.stub/stub-store stubs) [x] {}))))

(def ^:private database-stubs
  {:fk-keyed (constantly "DATABASE")
   :table    (constantly ["DATABASE" "SCHEMA" "TABLE"])
   :field    (constantly ["DATABASE" "SCHEMA" "TABLE" "FIELD"])})

(defn- export-with-field-stub
  "`x` exported by [[mbql/walk-export]] with every Field id replaced by `::field-id`."
  [x]
  (mbql/walk-export (fn [model x] (if (= model :model/Field) ::field-id x)) x))

(deftest ^:parallel drop-mbql-5-uuids-on-export-test
  (is (= [:field {} ::field-id]
         (export-with-field-stub [:field {:lib/uuid (fake-uuid 1)} 1])))
  (testing "uuids that aggregation refs point at are kept"
    (is (= [[:field {:lib/uuid (fake-uuid 1)} ::field-id]
            [:field {} ::field-id]
            [:aggregation {} (fake-uuid 1)]]
           (export-with-field-stub [[:field {:lib/uuid (fake-uuid 1)} 1]
                                    [:field {:lib/uuid (fake-uuid 2)} 1]
                                    [:aggregation {} (fake-uuid 1)]]))))
  (testing "field refs with string column names still have lib/uuid stripped, other opts kept"
    (is (= [:field {:base-type :type/Integer} "count"]
           (export-with-field-stub [:field {:lib/uuid (fake-uuid 1) :base-type :type/Integer} "count"]))))
  (testing "metric refs with non-integer ids still strip lib/uuid"
    (is (= [:metric {} "already-exported-eid"]
           (export-with-field-stub [:metric {:lib/uuid (fake-uuid 1)} "already-exported-eid"])))))

(defn- transient-lib-markers
  "All `:lib`/`:lib.convert` namespaced keys anywhere in `query`, except the structural `:lib/type`."
  [query]
  (->> (tree-seq coll? seq query)
       (filter qualified-keyword?)
       (filter #(#{"lib" "lib.convert"} (namespace %)))
       (remove #{:lib/type})
       set))

(deftest ^:parallel strip-transient-markers-on-export-test
  (testing (str "Transient runtime markers that get added when a legacy query is normalized to MBQL 5 on read "
                "(`:lib.convert/converted?` and `:lib/transformation-added-base-type`) must not leak into serdes "
                "output, so a query exports identically whether it happened to be stored as legacy MBQL or MBQL 5 "
                "in the app DB (GHY-3728).")
    (let [legacy-query {:database (meta/id)
                        :type     :query
                        :query    {:source-table (meta/id :venues)
                                   :filter       [:> [:field (meta/id :venues :price) nil] 1]}}
          from-legacy  (lib/query meta/metadata-provider legacy-query)
          from-mbql5   (lib/prepare-for-serialization from-legacy)]
      (testing "sanity check: a query freshly converted from legacy carries the transient markers"
        (is (contains? (transient-lib-markers from-legacy) :lib.convert/converted?))
        (is (contains? (transient-lib-markers from-legacy) :lib/transformation-added-base-type)))
      (let [export (partial export-one database-stubs)]
        (testing "the markers are stripped on export"
          (is (not (contains? (transient-lib-markers (export from-legacy)) :lib.convert/converted?)))
          (is (not (contains? (transient-lib-markers (export from-legacy))
                              :lib/transformation-added-base-type))))
        (testing "export is identical regardless of whether the query was stored as legacy MBQL or MBQL 5"
          (is (= (export from-mbql5)
                 (export from-legacy))))))))

(deftest ^:parallel drop-mbql-5-uuids-on-export-test-2
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                  (lib/filter (lib/= (meta/field-metadata :venues :id) 1))
                  (lib/aggregate (-> (lib/count)
                                     (lib/update-options assoc :lib/uuid (fake-uuid 0))))
                  (as-> $query (lib/order-by $query (first (lib/aggregations-metadata $query)))))]
    (is (= #{(fake-uuid 0)}
           (#'mbql/required-lib-uuids query)))
    (let [export (partial export-one database-stubs)]
      (is (= {:lib/type :mbql/query
              :database "DATABASE"
              :stages   [{:lib/type     :mbql.stage/mbql
                          :source-table ["DATABASE" "SCHEMA" "TABLE"]
                          :filters      [[:=
                                          {}
                                          [:field
                                           {:effective-type :type/BigInteger, :base-type :type/BigInteger}
                                           ["DATABASE" "SCHEMA" "TABLE" "FIELD"]]
                                          1]]
                          :aggregation  [[:count {:lib/uuid (fake-uuid 0)}]]
                          :order-by     [[:asc
                                          {}
                                          [:aggregation
                                           {:base-type       :type/Integer
                                            :effective-type  :type/Integer
                                            :lib/source-name "count"}
                                           (fake-uuid 0)]]]}]}
             (export query))))))

(deftest ^:parallel hydrate-mbql-5-uuids-on-import-test
  (let [query {:lib/type "mbql/query"
               :database "DATABASE"
               :stages   [{:lib/type     "mbql.stage/mbql"
                           :source-table ["DATABASE" "SCHEMA" "TABLE"]
                           :filters      [["="
                                           {}
                                           ["field"
                                            {:effective-type "type/BigInteger", :base-type "type/BigInteger"}
                                            ["DATABASE" "SCHEMA" "TABLE" "FIELD"]]
                                           1]]
                           :aggregation  [["count" {:lib/uuid (fake-uuid 0)}]]
                           :order-by     [["asc"
                                           {}
                                           [:aggregation {:base-type       "type/Integer"
                                                          :effective-type  "type/Integer"
                                                          :lib/source-name "count"}
                                            (fake-uuid 0)]]]}]}
        import-query (partial import-one {:database (constantly 1) :table (constantly 2) :field (constantly 3)})]
    (is (=? {:lib/type :mbql/query
             :database 1
             :stages   [{:lib/type     :mbql.stage/mbql
                         :source-table 2
                         :filters      [[:=
                                         {:lib/uuid string?}
                                         [:field
                                          {:lib/uuid       string?
                                           :effective-type :type/BigInteger
                                           :base-type      :type/BigInteger}
                                          3]
                                         1]]
                         :aggregation  [[:count {:lib/uuid (fake-uuid 0)}]]
                         :order-by     [[:asc
                                         {:lib/uuid string?}
                                         [:aggregation
                                          {:base-type       :type/Integer
                                           :effective-type  :type/Integer
                                           :lib/source-name "count"}
                                          (fake-uuid 0)]]]}]}
            (import-query query)))))

(deftest ^:parallel import-mbql-legacy-query-test
  (let [import-query (partial import-one {:database (constantly 1) :table (constantly 2) :field (constantly 3)})]
    (testing "legacy MBQL query is converted to MBQL 5, keeping integer literals in comparisons and aggregations"
      (is (=? {:lib/type :mbql/query
               :database 1
               :stages   [{:source-table 2
                           :filters      [[:= {} [:field {} 3] 1]
                                          [:= {} 1 1]
                                          [:< {} 4 5]]
                           :aggregation  [[:sum-where {} [:field {} 3] [:= {} 6 6]]]
                           :joins        [{:alias      "J"
                                           :conditions [[:= {} 1 1]]}]}]}
              (import-query
               {:database "DB"
                :type     "query"
                :query    {:source-table ["DB" "SCHEMA" "TABLE"]
                           :filter       ["and"
                                          ["=" ["field" ["DB" "SCHEMA" "TABLE" "FIELD"] nil] 1]
                                          ["=" 1 1]
                                          ["<" 4 5]]
                           :aggregation  [["sum-where" ["field" ["DB" "SCHEMA" "TABLE" "FIELD"] nil] ["=" 6 6]]]
                           :joins        [{:source-table ["DB" "SCHEMA" "TABLE"]
                                           :alias        "J"
                                           :condition    ["=" 1 1]}]}}))))
    (testing "a legacy native query is not converted"
      (is (=? {:database 1
               :type     "native"
               :native   {:query "SELECT 1"}}
              (import-query {:database "DB", :type "native", :native {:query "SELECT 1"}}))))))

(deftest ^:parallel hydrate-mbql-5-uuids-on-import-test-2
  (let [import-query (partial import-one {:field (constantly 3)})]
    (are [x expected] (=? expected
                          (import-query x))
      ["field" {} ["DB" "SCHEMA" "TABLE" "FIELD"]]
      [:field {:lib/uuid string?} 3]

      ["dimension" ["field" ["DB" "SCHEMA" "TABLE" "FIELD"] {:source-field ["DB" "SCHEMA" "TABLE" "FIELD2"]}]]
      [:dimension [:field 3 {:source-field 3}]])))

(deftest ^:parallel export-mbql-3-field-id-ref-in-viz-settings-test
  (testing "Allegedly viz settings can still contain MBQL 3 `:field-id` refs, make sure we export them properly"
    (let [export (partial export-one {:field (constantly ["A" "B" "C" "D"])})]
      (are [clause expected] (= expected
                                (export clause))

        [:field-id 1]
        [:field-id ["A" "B" "C" "D"]]

        ["field-id" 1]
        [:field-id ["A" "B" "C" "D"]]

        [:fk-> [:field-id 1] [:field-id 2]]
        [:fk-> [:field-id ["A" "B" "C" "D"]] [:field-id ["A" "B" "C" "D"]]]

        ["fk->" ["field-id" 1] ["field-id" 2]]
        ["fk->" [:field-id ["A" "B" "C" "D"]] [:field-id ["A" "B" "C" "D"]]]))))

(deftest ^:parallel export-import-template-tag-table-id-test
  (testing "template tags of type :table serialize their :table-id as a reference"
    (let [template-tags {"table" {:id           "abc"
                                  :name         "table"
                                  :display-name "Table"
                                  :type         :table
                                  :table-id     42}}
          exported      (export-one {:table (constantly ["DB" "SCHEMA" "TABLE"])} template-tags)]
      (is (= {"table" {:id           "abc"
                       :name         "table"
                       :display-name "Table"
                       :type         :table
                       :table-id     ["DB" "SCHEMA" "TABLE"]}}
             exported))
      (is (= 42
             (get-in (import-one {:table (constantly 42)} exported) ["table" :table-id]))))))

(def ^:private native-query-with-template-tag
  "A native query with one variable, already past FK resolution (numeric `:database`), as [[mbql/walk-import]]
  sees it mid-import."
  {:lib/type :mbql/query
   :database 1
   :stages   [{:lib/type      :mbql.stage/native
               :native        "SELECT * FROM PRODUCTS WHERE ID = {{id}}"
               :template-tags {"id" {:type :number :name "id" :display-name "ID" :id "abc-123"}}}]})

(def ^:private query-with-unknown-tag-type
  "The same query with a template tag whose `:type` this version has no representation for - what an export from a
  newer Metabase that introduced a new tag type would look like. It normalizes without complaint, so only validating
  the result catches it."
  (assoc-in native-query-with-template-tag [:stages 0 :template-tags]
            {"id" {:type :tag-type-from-the-future :name "id" :display-name "ID" :id "abc-123"}}))

(deftest ^:parallel import-mbql-validates-against-local-schema-test
  (testing "GHY-4241: a query shape this version cannot represent is refused instead of stored"
    (testing "a query matching this instance's schema imports"
      (is (=? {:lib/type :mbql/query}
              (import-one native-query-with-template-tag))))
    (testing "a query carrying a shape with no representation here is refused"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"does not match this Metabase's query schema"
           (import-one query-with-unknown-tag-type))))))

(deftest ^:parallel import-mbql-schema-validation-opt-out-test
  (testing "GHY-4241: :skip-schema-validation? disables the schema check"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid input.*:template-tags"
         (first (mbql/import-mbql (protocol.stub/stub-store {}) [query-with-unknown-tag-type]
                                  {:skip-schema-validation? true}))))))

(deftest ^:parallel card-template-tag-round-trip-test
  (testing "card template tag names carry the card's entity id on export and the importing instance's id on import"
    (let [eid      "AAAAAAAAAAAAAAAAAAAAA"
          query    (lib/native-query meta/metadata-provider "SELECT * FROM {{#12-orders}}")
          exported (export-one (assoc database-stubs :fk (fn [id _model] (when (= id 12) eid))) query)
          imported (import-one {:database (constantly 1)
                                :fk       (fn [entity-id _model] (when (= entity-id eid) 34))}
                               exported)]
      (is (=? {:stages [{:native        (str "SELECT * FROM {{#" eid "-orders}}")
                         :template-tags [{:name (str "#" eid "-orders") :card-id eid}]}]}
              exported))
      (is (=? {:stages [{:native        "SELECT * FROM {{#34-orders}}"
                         :template-tags [{:name "#34-orders" :card-id 34}]}]}
              imported)))))

(deftest ^:parallel export-mbql-in-bulk-test
  (testing "exporting many queries resolves each kind of reference with one store call per model"
    (let [calls    (atom [])
          store    (protocol.stub/stub-store
                    {:calls    calls
                     :fk-keyed (constantly "DB")
                     :table    (fn [id] ["DB" nil (str "T" id)])
                     :field    (fn [id] ["DB" nil "T" (str "F" id)])})
          query    (fn [table-id field-id]
                     {:lib/type :mbql/query
                      :database 1
                      :stages   [{:lib/type     :mbql.stage/mbql
                                  :source-table table-id
                                  :fields       [[:field {:lib/uuid (fake-uuid field-id)} field-id]]}]})
          xs       (mbql/export-mbql store [(query 1 10) (query 2 20) (query 1 30)])]
      (is (= [["DB" nil "T1"] ["DB" nil "T2"] ["DB" nil "T1"]]
             (map #(get-in % [:stages 0 :source-table]) xs)))
      (is (= ["DB" nil "T" "F30"] (get-in (last xs) [:stages 0 :fields 0 2])))
      (is (= {[:select-by-pks :model/Database] 3
              [:select-by-pks :model/Table]    2
              [:select-by-pks :model/Field]    1}
             (frequencies @calls))))))

(deftest ^:parallel normalize-field-ref-reuses-cached-coercer-test
  (testing "normalizing :field refs hits registry coercer cache after first call"
    (let [misses (atom 0)]
      (binding [mr/*cache-miss-hook* (fn [k _schema _value]
                                       (when (= k ::lib.normalize/coercer)
                                         (swap! misses inc)))]
        (dotimes [_ 3]
          (mbql/normalize-mbql-ref [:field 1 nil])
          (mbql/normalize-mbql-ref [:field {:lib/uuid (fake-uuid 1)} 1])))
      (is (<= @misses 1)))))

(deftest ^:parallel drop-mbql-5-uuids-from-string-id-refs-test
  (testing "segment and measure refs with non-integer ids still strip lib/uuid"
    (is (= [:segment {} "already-exported-eid"]
           (export-with-field-stub [:segment {:lib/uuid (fake-uuid 1)} "already-exported-eid"])))
    (is (= [:measure {} "already-exported-eid"]
           (export-with-field-stub [:measure {:lib/uuid (fake-uuid 1)} "already-exported-eid"]))))
  (testing "required lib/uuids are kept even on string-id refs"
    (is (= [[:field {:lib/uuid (fake-uuid 1)} "name"]
            [:aggregation {} (fake-uuid 1)]]
           (export-with-field-stub [[:field {:lib/uuid (fake-uuid 1)} "name"]
                                    [:aggregation {} (fake-uuid 1)]])))))
