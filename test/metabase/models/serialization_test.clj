(ns metabase.models.serialization-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.test-metadata :as meta]
   [metabase.models.db :as models.db]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn- fake-uuid
  "Deterministic placeholder `:lib/uuid` for tests, e.g. `(fake-uuid 1)` => \"00000000-0000-0000-0000-000000000001\"."
  [n]
  (format "00000000-0000-0000-0000-%012d" n))

(deftest ^:parallel drop-mbql-5-uuids-on-export-test
  (binding [serdes/*export-field-fk* (constantly ::field-id)]
    (is (= [:field {} :metabase.models.serialization-test/field-id]
           (#'serdes/export-mbql-ref [:field {:lib/uuid (fake-uuid 1)} 1])))
    (binding [serdes/*required-lib-uuids-for-export* #{(fake-uuid 1)}]
      (is (= [:field {:lib/uuid (fake-uuid 1)} :metabase.models.serialization-test/field-id]
             (#'serdes/export-mbql-ref [:field {:lib/uuid (fake-uuid 1)} 1])))
      (is (= [:field {} :metabase.models.serialization-test/field-id]
             (#'serdes/export-mbql-ref [:field {:lib/uuid (fake-uuid 2)} 1]))))))

(deftest ^:parallel drop-mbql-5-uuids-from-string-id-refs-test
  (testing "field refs with string column names (e.g. source-card joins) should still have lib/uuid stripped"
    (is (= [:field {} "name"]
           (#'serdes/export-mbql-ref [:field {:lib/uuid (fake-uuid 1)} "name"])))
    (testing "and other opts are preserved"
      (is (= [:field {:base-type :type/Integer} "count"]
             (#'serdes/export-mbql-ref [:field {:lib/uuid (fake-uuid 1)
                                                :base-type :type/Integer} "count"])))))
  (testing "metric/segment/measure refs with non-integer ids (e.g. after re-export) still strip lib/uuid"
    (is (= [:metric {} "already-exported-eid"]
           (#'serdes/export-mbql-ref [:metric {:lib/uuid (fake-uuid 1)}
                                      "already-exported-eid"])))
    (is (= [:segment {} "already-exported-eid"]
           (#'serdes/export-mbql-ref [:segment {:lib/uuid (fake-uuid 1)}
                                      "already-exported-eid"])))
    (is (= [:measure {} "already-exported-eid"]
           (#'serdes/export-mbql-ref [:measure {:lib/uuid (fake-uuid 1)}
                                      "already-exported-eid"]))))
  (testing "required lib/uuids are preserved even for string-id refs"
    (binding [serdes/*required-lib-uuids-for-export* #{(fake-uuid 1)}]
      (is (= [:field {:lib/uuid (fake-uuid 1)} "name"]
             (#'serdes/export-mbql-ref [:field {:lib/uuid (fake-uuid 1)}
                                        "name"]))))))

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
          ;; how a card is read from the app DB when its `dataset_query` is still stored as legacy MBQL
          from-legacy  (lib/query meta/metadata-provider legacy-query)
          ;; how the same card is read after being (re-)saved, i.e. persisted to the app DB as MBQL 5
          from-mbql5   (lib/prepare-for-serialization from-legacy)]
      (testing "sanity check: a query freshly converted from legacy carries the transient markers"
        (is (contains? (transient-lib-markers from-legacy) :lib.convert/converted?))
        (is (contains? (transient-lib-markers from-legacy) :lib/transformation-added-base-type)))
      (binding [serdes/*export-database-fk* (constantly "DATABASE")
                serdes/*export-table-fk*    (constantly ["DATABASE" "SCHEMA" "TABLE"])
                serdes/*export-field-fk*    (constantly ["DATABASE" "SCHEMA" "TABLE" "FIELD"])]
        (testing "the markers are stripped on export"
          (is (not (contains? (transient-lib-markers (serdes/export-mbql from-legacy)) :lib.convert/converted?)))
          (is (not (contains? (transient-lib-markers (serdes/export-mbql from-legacy))
                              :lib/transformation-added-base-type))))
        (testing "export is identical regardless of whether the query was stored as legacy MBQL or MBQL 5"
          (is (= (serdes/export-mbql from-mbql5)
                 (serdes/export-mbql from-legacy))))))))

(deftest ^:parallel drop-mbql-5-uuids-on-export-test-2
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                  (lib/filter (lib/= (meta/field-metadata :venues :id) 1))
                  (lib/aggregate (-> (lib/count)
                                     (lib/update-options assoc :lib/uuid (fake-uuid 0))))
                  (as-> $query (lib/order-by $query (first (lib/aggregations-metadata $query)))))]
    (is (= #{(fake-uuid 0)}
           (#'serdes/collect-required-lib-uuids query)))
    (binding [serdes/*export-database-fk* (constantly "DATABASE")
              serdes/*export-table-fk*    (constantly ["DATABASE" "SCHEMA" "TABLE"])
              serdes/*export-field-fk*    (constantly ["DATABASE" "SCHEMA" "TABLE" "FIELD"])]
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
             (serdes/export-mbql query))))))

(deftest ^:parallel hydrate-mbql-5-uuids-on-import-test
  ;; when read out of the YAML, map keys should get keywordized but not other strings
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
                                            (fake-uuid 0)]]]}]}]
    (binding [serdes/*import-database-fk* (constantly 1)
              serdes/*import-table-fk*    (constantly 2)
              serdes/*import-field-fk*    (constantly 3)]
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
              (serdes/import-mbql query))))))

(deftest ^:parallel import-mbql-legacy-query-test
  (binding [serdes/*import-database-fk* (constantly 1)
            serdes/*import-table-fk*    (constantly 2)
            serdes/*import-field-fk*    (constantly 3)]
    (testing "a legacy MBQL query is converted to MBQL 5, keeping integer literals in comparisons and aggregations as literals"
      (is (=? {:lib/type :mbql/query
               :database 1
               :stages   [{:source-table 2
                           :filters      [[:= {} [:field {} 3] 1]
                                          [:= {} 1 1]
                                          [:< {} 4 5]]
                           :aggregation  [[:sum-where {} [:field {} 3] [:= {} 6 6]]]
                           :joins        [{:alias      "J"
                                           :conditions [[:= {} 1 1]]}]}]}
              (serdes/import-mbql
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
              (serdes/import-mbql {:database "DB", :type "native", :native {:query "SELECT 1"}}))))))

(deftest ^:parallel hydrate-mbql-5-uuids-on-import-test-2
  (binding [serdes/*import-field-fk* (constantly 3)]
    (are [x expected] (=? expected
                          (serdes/import-mbql x))
      ["field" {} ["DB" "SCHEMA" "TABLE" "FIELD"]]
      [:field {:lib/uuid string?} 3]

      ["dimension" ["field" ["DB" "SCHEMA" "TABLE" "FIELD"] {:source-field ["DB" "SCHEMA" "TABLE" "FIELD2"]}]]
      [:dimension [:field 3 {:source-field 3}]])))

(deftest ^:parallel export-mbql-3-field-id-ref-in-viz-settings-test
  (testing "Allegedly viz settings can still contain MBQL 3 `:field-id` refs, make sure we export them properly"
    (binding [serdes/*export-field-fk* (constantly ["A" "B" "C" "D"])]
      (are [clause expected] (= expected
                                (#'serdes/export-mbql clause))

        [:field-id 1]
        [:field-id ["A" "B" "C" "D"]]

        ["field-id" 1]
        [:field-id ["A" "B" "C" "D"]]

        [:fk-> [:field-id 1] [:field-id 2]]
        [:fk-> [:field-id ["A" "B" "C" "D"]] [:field-id ["A" "B" "C" "D"]]]

        ["fk->" ["field-id" 1] ["field-id" 2]]
        ["fk->" [:field-id ["A" "B" "C" "D"]] [:field-id ["A" "B" "C" "D"]]]))))

(deftest ^:parallel normalize-field-ref-reuses-cached-coercer-test
  (testing "normalizing :field refs hits the registry coercer cache after the first call"
    (let [misses (atom 0)]
      (binding [mr/*cache-miss-hook* (fn [k _schema _value]
                                       (when (= k ::lib.normalize/coercer)
                                         (swap! misses inc)))]
        (dotimes [_ 3]
          (#'serdes/normalize-mbql-ref [:field 1 nil])
          (#'serdes/normalize-mbql-ref [:field {:lib/uuid (fake-uuid 1)} 1])))
      (is (<= @misses 1)))))

(deftest ^:parallel export-visualization-settings-test
  (binding [serdes/*export-field-fk* (constantly ["A" "B" "C" "D"])
            serdes/*export-fk*       (fn [id model]
                                       (format "%s___%d" (name model) id))]
    (is (= {:column_settings
            {"[\"ref\",[\"field\",[\"A\",\"B\",\"C\",\"D\"],null]]"
             {:column_title "Locus"
              :click_behavior
              {:type     "link"
               :linkType "question"
               :targetId "Card___1"
               :parameterMapping
               {"[\"dimension\",[\"field\",[\"A\",\"B\",\"C\",\"D\"],{\"source-field\":[\"A\",\"B\",\"C\",\"D\"]}]]"
                {:id     "[\"dimension\",[\"field\",[\"A\",\"B\",\"C\",\"D\"],{\"source-field\":[\"A\",\"B\",\"C\",\"D\"]}]]"
                 :source {:type "column", :id "Category_ID", :name "Category ID"}
                 :target {:type      "dimension"
                          :id        "[\"dimension\",[\"field\",[\"A\",\"B\",\"C\",\"D\"],{\"source-field\":[\"A\",\"B\",\"C\",\"D\"]}]]"
                          :dimension [:dimension [:field ["A" "B" "C" "D"] {:source-field ["A" "B" "C" "D"]}]]}}}}}}}
           (serdes/export-visualization-settings
            {:column_settings
             {"[\"ref\",[\"field\",54,null]]"
              {:column_title "Locus"
               :click_behavior
               {:type     "link"
                :linkType "question"
                :targetId 1
                :parameterMapping
                {(keyword "[\"dimension\",[\"field\",54,{\"source-field\":53}]]")
                 {:id     "[\"dimension\",[\"field\",54,{\"source-field\":53}]]"
                  :source {:type "column", :id "Category_ID", :name "Category ID"}
                  :target {:type      "dimension"
                           :id        "[\"dimension\",[\"field\",54,{\"source-field\":53}]]"
                           :dimension ["dimension" [:field 54 {:source-field 53}]]}}}}}}})))))

(deftest ^:parallel import-viz-settings-test
  (binding [serdes/*import-field-fk* (constantly 3)]
    (is (= {:column_settings
            {"[\"ref\",[\"field\",3,null]]"
             {:click_behavior
              {:parameterMapping
               {"[\"dimension\",[\"field\",3,{\"source-field\":3}]]"
                {:id     "[\"dimension\",[\"field\",3,{\"source-field\":3}]]"
                 :target {:type      "dimension"
                          :dimension [:dimension [:field 3 {:source-field 3}]]
                          :id        "[\"dimension\",[\"field\",3,{\"source-field\":3}]]"}}}}}}}
           (serdes/import-visualization-settings
            {:column_settings
             {"[\"ref\",[\"field\",[\"my-db\",null,\"orders\",\"invoice\"],null]]"
              {:click_behavior
               {:parameterMapping
                {"[\"dimension\",[\"field\",[\"my-db\",null,\"orders\",\"invoice\"],{\"source-field\":[\"my-db\",null,\"orders\",\"subtotal\"]}]]"
                 {:id     "[\"dimension\",[\"field\",[\"my-db\",null,\"orders\",\"invoice\"],{\"source-field\":[\"my-db\",null,\"orders\",\"subtotal\"]}]]"
                  :target {:type      "dimension"
                           :dimension [:dimension
                                       [:field
                                        ["my-db" nil "orders" "invoice"]
                                        {:source-field ["my-db" nil "orders" "subtotal"]}]]
                           :id        "[\"dimension\",[\"field\",[\"my-db\",null,\"orders\",\"invoice\"],{\"source-field\":[\"my-db\",null,\"orders\",\"subtotal\"]}]]"}}}}}}})))))

(deftest ^:parallel export-import-template-tag-table-id-test
  (testing "template tags of type :table serialize their :table-id as a portable tuple"
    (let [template-tags {"table" {:id           "abc"
                                  :name         "table"
                                  :display-name "Table"
                                  :type         :table
                                  :table-id     42}}
          exported      (binding [serdes/*export-table-fk* (constantly ["DB" "SCHEMA" "TABLE"])]
                          (serdes/export-mbql template-tags))]
      (is (= {"table" {:id           "abc"
                       :name         "table"
                       :display-name "Table"
                       :type         :table
                       :table-id     ["DB" "SCHEMA" "TABLE"]}}
             exported))
      (is (= 42
             (binding [serdes/*import-table-fk* (constantly 42)]
               (get-in (#'serdes/import-mbql* exported) ["table" :table-id])))))))

(deftest ^:parallel template-tag-table-id-deps-test
  (testing "template tag :table-id is not a dependency — the referenced Database and Table are synthesized on import if
            missing"
    (is (= #{}
           (#'serdes/mbql-deps-map false {:table-id ["DB" "SCHEMA" "TABLE"]})))))

(deftest ^:parallel mbql-deps-format-parity-test
  (testing "mbql-deps finds each reference on both the serialized (portable) and the raw (numeric) form of a query.
            serialization-dependencies runs on raw entities and existence-checks the referenced Table/Field;
            deserialization-dependencies runs on the serialized form, where Database/Table/Field are synthesized on
            import, so it reports none of them. Every other ref type resolves to the same model in both forms. This is
            the parity guard for the two dependency codepaths sharing mbql-deps."
    (let [models (fn [deps] (into #{} (map (comp :model last)) deps))
          eid    (fn [c] (apply str (repeat 21 c)))]
      (testing "MBQL ref clauses"
        (doseq [[label serialized raw ser-models raw-models]
                [["field (MBQL 5)"  [:field {} ["DB" "S" "T" "F"]] [:field {} 53]  #{}           #{"Field"}]
                 ["field (legacy)" [:field ["DB" "S" "T" "F"] {}] [:field 53 {}]  #{}           #{"Field"}]
                 ["metric"         [:metric {} (eid \a)]          [:metric {} 99] #{"Card"}     #{"Card"}]
                 ["segment"        [:segment {} (eid \b)]         [:segment {} 5]  #{"Segment"}  #{"Segment"}]
                 ["measure"        [:measure {} (eid \c)]         [:measure {} 3]  #{"Measure"}  #{"Measure"}]]]
          (testing label
            (is (= ser-models (models (serdes/mbql-deps false serialized))) "serialized (portable) form")
            (is (= raw-models (models (serdes/mbql-deps true raw)))
                "raw (numeric) form"))))
      (testing "MBQL map keys"
        (doseq [[label serialized raw ser-models raw-models]
                [["source-table" {:source-table ["DB" "S" "T"]} {:source-table 9} #{}                     #{"Table"}]
                 ["source-card"  {:source-card (eid \d)}         {:source-card 7}  #{"Card"}               #{"Card"}]
                 ["snippet-id"   {:snippet-id (eid \e)}          {:snippet-id 2}   #{"NativeQuerySnippet"} #{"NativeQuerySnippet"}]]]
          (testing label
            (is (= ser-models (models (#'serdes/mbql-deps-map false serialized))) "serialized")
            (is (= raw-models (models (#'serdes/mbql-deps-map true raw)))
                "raw")))))))

(deftest ^:parallel export-parameters-test
  (binding [serdes/*export-fk*       (fn [id model]
                                       (format "%s___%d" (name model) id))
            serdes/*export-field-fk* (constantly ["DATABASE" "SCHEMA" "TABLE" "FIELD"])]
    (is (= [{:id                   "abc"
             :name                 "CATEGORY"
             :position             0
             :type                 :category
             :values_source_config {:card_id     "Card___1"
                                    :value_field [:field ["DATABASE" "SCHEMA" "TABLE" "FIELD"] nil]}
             :values_source_type   :card}]
           (serdes/export-parameters [{:id                   "abc"
                                       :type                 :category
                                       :name                 "CATEGORY"
                                       :values_source_type   :card
                                       :values_source_config {:card_id 1, :value_field [:field 53 nil]}
                                       :position             0}])))))

(def ^:private native-query-with-template-tag
  "A native query with one variable, already past FK resolution (numeric `:database`), as [[serdes/import-mbql]]
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
              (serdes/import-mbql native-query-with-template-tag))))
    (testing "a query carrying a shape with no representation here is refused"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"does not match this Metabase's query schema"
           (serdes/import-mbql query-with-unknown-tag-type))))))

(deftest ^:parallel import-mbql-schema-validation-opt-out-test
  (testing "GHY-4241: binding *skip-schema-validation?* disables the schema check"
    ;; Skipping does not make the import succeed - `repair-card-template-tag-names` rejects a tag type it does not
    ;; know on its own. Asserting on that downstream failure keeps this from passing for the wrong reason.
    (binding [serdes/*skip-schema-validation?* true]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid input.*:template-tags"
           (serdes/import-mbql query-with-unknown-tag-type))))))

(deftest ^:parallel field-path->field-ref-test
  (testing "a Field path turns into the reference `*import-field-fk*` takes, with or without a schema"
    (is (= ["db" "PUBLIC" "orders" "id"]
           (serdes/field-path->field-ref [{:model "Database" :id "db"} {:model "Schema" :id "PUBLIC"}
                                          {:model "Table" :id "orders"} {:model "Field" :id "id"}])))
    (is (= ["db" nil "orders" "id"]
           (serdes/field-path->field-ref [{:model "Database" :id "db"} {:model "Table" :id "orders"}
                                          {:model "Field" :id "id"}]))))
  (testing "a nested Field of a Table without a schema keeps the Table and every parent Field in place"
    (is (= ["db" nil "orders" "customer" "tier"]
           (serdes/field-path->field-ref [{:model "Database" :id "db"} {:model "Table" :id "orders"}
                                          {:model "Field" :id "customer"} {:model "Field" :id "tier"}])))))

(deftest ^:parallel import-visualization-settings-drops-nil-column-settings-test
  (testing "an exported `column_settings: null` imports as no column_settings key, which the app DB reads as {}"
    (is (not (contains? (serdes/import-visualization-settings {:column_settings nil}) :column_settings)))
    (is (= {} (serdes/import-visualization-settings {:column_settings nil}))))
  (testing "a column_settings map is still imported"
    (is (contains? (serdes/import-visualization-settings {:column_settings {}}) :column_settings))))

(deftest ^:parallel same-stored-value?-test
  (let [same? #'serdes/same-stored-value?]
    (testing "equal values"
      (is (same? 1 1))
      (is (same? {:a 1} {:a 1}))
      (is (same? nil nil))
      (is (not (same? 1 2))))
    (testing "timestamps compare by instant"
      (let [offset (java.time.OffsetDateTime/parse "2024-08-28T09:46:18.671622Z")
            zoned  (java.time.ZonedDateTime/parse "2024-08-28T11:46:18.671622+02:00[Europe/Berlin]")]
        (is (same? offset zoned))
        (is (same? offset (.toInstant offset)))
        (is (not (same? offset (.plusNanos zoned 1000))))
        (testing "a timestamp is not the same as a value that is not a timestamp"
          (is (not (same? offset "2024-08-28T09:46:18.671622Z")))
          (is (not (same? offset nil))))
        (testing "a LocalDateTime is not recognized, so it compares as changed"
          (is (not (same? (.toLocalDateTime offset) (.toLocalDateTime zoned)))))))
    (testing "a stored keyword is the same as its name"
      (is (same? :line "line"))
      (is (same? :type/Text "type/Text"))
      (is (not (same? :line "table")))
      (is (not (same? "line" :line)) "only a stored keyword against an incoming string"))
    (testing "MBQL 5 queries compare without :lib/metadata and without the :lib/uuid values no aggregation ref uses"
      (let [query (fn [count-uuid filter-uuid ref-uuid]
                    {:lib/type     :mbql/query
                     :lib/metadata ::metadata-provider
                     :database     1
                     :stages       [{:lib/type     :mbql.stage/mbql
                                     :source-table 2
                                     :aggregation  [[:count {:lib/uuid count-uuid}]]
                                     :filters      [[:> {:lib/uuid filter-uuid} [:field {:lib/uuid (fake-uuid 9)} 3] 1]]
                                     :order-by     [[:asc {:lib/uuid ref-uuid} [:aggregation {} count-uuid]]]}]})]
        (is (same? (query (fake-uuid 1) (fake-uuid 2) (fake-uuid 3))
                   (dissoc (query (fake-uuid 1) (fake-uuid 4) (fake-uuid 5)) :lib/metadata))
            "new uuids that no aggregation ref uses do not count")
        (is (not (same? (query (fake-uuid 1) (fake-uuid 2) (fake-uuid 3))
                        (query (fake-uuid 6) (fake-uuid 2) (fake-uuid 3))))
            "a new uuid for an aggregation that a ref uses counts, so the query compares as changed")
        (is (not (same? (query (fake-uuid 1) (fake-uuid 2) (fake-uuid 3))
                        (assoc-in (query (fake-uuid 1) (fake-uuid 2) (fake-uuid 3)) [:stages 0 :source-table] 7)))
            "a real change counts")
        (testing "maps that are not MBQL 5 queries compare by equality"
          (is (not (same? {:a {:lib/uuid (fake-uuid 1)}} {:a {:lib/uuid (fake-uuid 2)}}))))))))

(deftest ^:parallel drop-unchanged-columns-test
  (let [drop-unchanged #'serdes/drop-unchanged-columns
        baseline       {:id         1
                        :name       "Card"
                        :display    :line
                        :created_at (java.time.OffsetDateTime/parse "2024-08-28T09:46:18Z")}]
    (testing "keeps only the columns whose value changed"
      (is (= {:name "New name"}
             (drop-unchanged baseline {:name       "New name"
                                       :display    "line"
                                       :created_at (java.time.ZonedDateTime/parse "2024-08-28T09:46:18Z")}))))
    (testing "returns an empty map when nothing changed"
      (is (= {} (drop-unchanged baseline {:name "Card" :display "line"}))))
    (testing "keeps a column that the baseline does not have"
      (is (= {:bundle "bytes"} (drop-unchanged baseline {:name "Card" :bundle "bytes"}))))
    (testing "keeps a column that changes to nil"
      (is (= {:display nil} (drop-unchanged baseline {:display nil}))))))

(deftest update-changed-columns!-adjust-changes-test
  (let [writes   (atom [])
        adjusted (atom [])
        update!  (fn [opts]
                   (reset! writes [])
                   (mt/with-dynamic-fn-redefs [models.db/update-entity! (fn [id entity] (swap! writes conj [id (:row entity)]))
                                               models.db/entity-by-pk   (fn [_model _pk id] {:id id})]
                     (serdes/update-changed-columns! "Collection"
                                                     {:name "Shared" :description "new"}
                                                     {:id 7}
                                                     {:id 7 :name "Shared" :description "old"}
                                                     opts))
                   @writes)]
    (testing "the default writes the changed columns as they are"
      (is (= [[7 {:description "new"}]] (update! {}))))
    (testing ":adjust-changes gets the changed columns and the normalized file row, and its result is the write"
      (is (= [[7 {:description "new" :name "Shared"}]]
             (update! {:adjust-changes (fn [changes row]
                                         (swap! adjusted conj [changes row])
                                         (assoc changes :name (:name row)))})))
      (is (= [[{:description "new"} {:name "Shared" :description "new"}]] @adjusted)))
    (testing "an empty result sends no write"
      (is (= [] (update! {:adjust-changes (constantly {})}))))))

(deftest ^:parallel with-field-path-cache-scope-test
  (testing "with-field-path-cache memoizes *export-field-fk* only inside its scope"
    (let [names (atom {1 "a"})]
      (binding [serdes/*export-field-fk* (fn [id] ["db" nil "table" (get @names id)])]
        (is (= "a" (last (serdes/with-field-path-cache (serdes/*export-field-fk* 1)))))
        (swap! names assoc 1 "b")
        (testing "a new scope sees a change"
          (is (= "b" (last (serdes/with-field-path-cache (serdes/*export-field-fk* 1))))))
        (testing "inside one scope, a change after the first lookup is not seen (the documented limit)"
          (is (= ["b" "b"]
                 (serdes/with-field-path-cache
                   (let [before (last (serdes/*export-field-fk* 1))]
                     (swap! names assoc 1 "c")
                     [before (last (serdes/*export-field-fk* 1))])))))
        (testing "outside any scope, nothing is cached"
          (is (= "c" (last (serdes/*export-field-fk* 1)))))))))

(deftest ^:parallel with-field-path-cache-nesting-and-bound-test
  (let [calls (atom 0)]
    (binding [serdes/*export-field-fk* (fn [id] (swap! calls inc) [id])]
      (serdes/with-field-path-cache
        (serdes/*export-field-fk* 1)
        (let [outer serdes/*export-field-fk*]
          (serdes/with-field-path-cache
            (is (identical? outer serdes/*export-field-fk*) "an inner scope uses the cache of the outer scope")
            (serdes/*export-field-fk* 1)))
        (is (= 1 @calls) "an inner scope reuses the cache of the outer scope")
        (reset! calls 0)
        (doseq [i (range 2 10003)]
          (serdes/*export-field-fk* i))
        (is (= 10001 @calls))
        (reset! calls 0)
        (serdes/*export-field-fk* 1)
        (is (= 1 @calls) "the cache holds at most 10,000 entries, so the oldest entry was evicted")))))

(deftest ^:parallel with-field-path-cache-does-not-cache-an-exception-test
  (let [calls (atom 0)]
    (binding [serdes/*export-field-fk* (fn [id]
                                         (when (= 1 (swap! calls inc))
                                           (throw (ex-info "lookup failed" {})))
                                         [id])]
      (serdes/with-field-path-cache
        (is (thrown? clojure.lang.ExceptionInfo (serdes/*export-field-fk* 7)))
        (is (= [7] (serdes/*export-field-fk* 7)) "a lookup that threw runs again")))))

(deftest ^:parallel with-field-path-cache-nil-field-id-test
  (is (nil? (serdes/with-field-path-cache (serdes/*export-field-fk* nil)))))
