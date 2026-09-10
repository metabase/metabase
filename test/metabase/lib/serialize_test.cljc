(ns metabase.lib.serialize-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.core]
   [metabase.lib.schema :as-alias lib.schema]
   [metabase.lib.schema.binning :as-alias lib.schema.binning]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.constraints :as-alias lib.schema.constraints]
   [metabase.lib.schema.info :as-alias lib.schema.info]
   [metabase.lib.schema.join :as-alias lib.schema.join]
   [metabase.lib.schema.metadata :as-alias lib.schema.metadata]
   [metabase.lib.schema.middleware-options :as-alias lib.schema.middleware-options]
   [metabase.lib.schema.parameter :as-alias lib.schema.parameter]
   [metabase.lib.schema.template-tag :as-alias lib.schema.template-tag]
   [metabase.lib.serialize :as lib.serialize]
   [metabase.util.malli.registry :as mr]))

(comment metabase.lib.core/keep-me)

(deftest ^:parallel strip-internal-keys-test
  (doseq [[schema m]
          [[::lib.schema.binning/binning                       {:strategy :num-bins, :num-bins 8}]
           [::lib.schema.parameter/parameter                   {:type :category, :id "p1"}]
           [::lib.schema.template-tag/template-tag             {:type :text, :name "t", :display-name "T", :id "id1"}]
           [::lib.schema.constraints/constraints               {:max-results 10}]
           [::lib.schema.middleware-options/middleware-options {:userland-query? true}]
           [::lib.schema/page                                  {:page 1, :items 10}]]
          f      [lib.serialize/prepare-after-deserialization
                  lib.serialize/prepare-for-serialization]]
    (testing (str schema " via " f)
      (is (= m (f schema (assoc m :a/b 1)))))))

(deftest ^:parallel remove-info-test
  (is (= {:lib/type :mbql/query
          :stages   [{:lib/type     :mbql.stage/mbql
                      :source-table 1}]
          :database 1}
         (lib.serialize/prepare-for-serialization
          {:lib/type :mbql/query
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table 1}]
           :database 1
           :info     {:x 1}}))))

#?(:clj
   (deftest ^:parallel encode-literal-java-time-types-test
     (is (= "2022-10-03T00:00"
            (lib.serialize/prepare-for-serialization
             :metabase.lib.schema.literal/temporal
             #t "2022-10-03T00:00")))))

#?(:clj
   (deftest ^:parallel encode-java-time-types-in-expressions-test
     (is (= "2022-10-03T00:00"
            (lib.serialize/prepare-for-serialization
             :metabase.lib.schema.expression/temporal
             #t "2022-10-03T00:00")))))

#?(:clj
   (deftest ^:parallel encode-java-time-types-in-expressions-test-2
     (is (= [:datetime-add {:lib/uuid            "0b5cf908-caa0-45f8-92e9-90e3b939b14a"
                            :lib/expression-name "second"}
             "2022-10-03T00:00"
             1
             :day]
            (lib.serialize/prepare-for-serialization
             :mbql.clause/datetime-add
             [:datetime-add {:lib/uuid            "0b5cf908-caa0-45f8-92e9-90e3b939b14a"
                             :lib/expression-name "second"}
              #t "2022-10-03T00:00"
              1
              :day])))))

#?(:clj
   (deftest ^:parallel encode-java-time-types-in-expressions-test-3
     (is (= {:lib/type :mbql/query
             :stages   [{:lib/type     :mbql.stage/mbql
                         :limit        1
                         :expressions  [[:datetime-add {:lib/uuid            "0b5cf908-caa0-45f8-92e9-90e3b939b14a"
                                                        :lib/expression-name "second"}
                                         "2022-10-03T00:00"
                                         1
                                         :day]]
                         :source-table 1}]
             :database 1}
            (lib.serialize/prepare-for-serialization
             {:lib/type :mbql/query
              :stages   [{:lib/type     :mbql.stage/mbql
                          :limit        1
                          :expressions  [[:datetime-add {:lib/uuid            "0b5cf908-caa0-45f8-92e9-90e3b939b14a"
                                                         :lib/expression-name "second"}
                                          #t "2022-10-03T00:00"
                                          1
                                          :day]]
                          :source-table 1}]
              :database 1})))))

#?(:clj
   (deftest ^:parallel encode-java-time-types-in-native-query-args-test
     (is (= {:lib/type :mbql/query
             :stages   [{:lib/type :mbql.stage/native
                         :native   "SELECT *"
                         :params   ["2022-10-03T00:00"]}]
             :database 1}
            (lib.serialize/prepare-for-serialization
             {:lib/type :mbql/query
              :stages   [{:lib/type :mbql.stage/native
                          :native   "SELECT *"
                          :params   [#t "2022-10-03T00:00"]}]
              :database 1})))))

;;;;
;;;; Internal (query processor / permissions / sandboxing) keys.
;;;;
;;;; Every namespaced key that middleware `assoc`es onto a query, stage, join or clause-options map at runtime is
;;;; declared as an optional entry on the corresponding schema, so those schemas can be closed. Declaring them must
;;;; NOT stop them from being stripped when a query crosses the REST API / app DB boundary -- that is what these tests
;;;; check.
;;;;

(defn- declared-internal-keys
  "The [[lib.schema.common/internal-key?]] keys declared as map entries in the (unresolved) form of `schema-name`.
  Driving the tests below off this rather than off a hand-written list means they cannot drift from the schemas: a
  newly declared key is automatically required to appear in the fixture query and to get stripped.

  Only descends into vectors and seqs so that schema property maps (`{:decode/api ...}` and friends, whose keys are
  also namespaced) are not mistaken for entries."
  [schema-name]
  (into #{}
        (comp (filter vector?)
              (keep first)
              (filter lib.schema.common/internal-key?))
        (tree-seq (some-fn vector? seq?) seq (mr/schema schema-name))))

(def ^:private external-remap
  "One `:metabase.query-processor.middleware.add-remaps/external-remapping`-shaped map."
  {:id                        1
   :name                      "Category"
   :field-id                  2
   :field-name               "CATEGORY_ID"
   :human-readable-field-id   3
   :human-readable-field-name "NAME"})

(def ^:private options-internal-keys
  "Every internal key middleware adds to a clause/ref options map."
  {:qp/ignore-coercion                                                      true
   :qp/allow-coercion-for-columns-without-integer-qp.add.source-table       true
   :qp/native-sandbox-column.force-coercion-strategy                        :Coercion/UNIXSeconds->DateTime
   :metabase.query-processor.util.add-alias-info/source-table               1
   :metabase.query-processor.util.add-alias-info/source-alias               "ID"
   :metabase.query-processor.util.add-alias-info/desired-alias              "ID_2"
   :metabase.query-processor.util.add-alias-info/nfc-path                   ["parent" "child"]
   :metabase.query-processor.util.add-alias-info/resolved                   {:lib/type  :metadata/column
                                                                             :name      "ID"
                                                                             :base-type :type/Integer}
   :metabase.query-processor.util.transformations.nest-breakouts/externally-remapped-field true
   :metabase.query-processor.middleware.add-remaps/new-field-dimension-id      1
   :metabase.query-processor.middleware.add-remaps/original-field-dimension-id 1
   :metabase.driver.sql.query-processor/forced-alias                        true
   :metabase.driver.sql.query-processor/add-cast                            :bit
   :metabase.driver.sql.query-processor/wrap-in-case                        true
   :metabase.driver.sql.parameters.substitution/compiling-field-filter?     true
   :metabase.driver.sqlserver/optimized-bucketing?                          true
   :metabase.driver.mongo.query-processor/join-local                        "Cat"})

(def ^:private stage-internal-keys
  "Every internal key middleware adds to a stage, other than the native-only `:query-permissions/referenced-card-ids`."
  {:qp/stage-is-from-source-card      1
   :qp/stage-had-source-card          1
   :qp/added-implicit-fields?         true
   :qp/skip-persisted-cache           true
   :persisted-info/native             "SELECT * FROM cache_1"
   :source-query/model?               true
   :source-query/native-model?        false
   :query-permissions/sandboxed-table 1
   :metabase-enterprise.sandbox.query-processor.middleware.sandboxing/sandbox?              true
   :metabase.query-processor.middleware.add-remaps/remaps                                   [external-remap]
   :metabase.query-processor.middleware.cumulative-aggregations/replaced-indexes            #{0}
   :metabase.query-processor.middleware.add-implicit-joins/reused-join-aliases              #{"Cat"}
   :metabase.query-processor.util.add-alias-info/desired-alias->escaped                     {"ID" "ID_2"}
   :metabase.query-processor.util.add-alias-info/join-alias->escaped                        {"Cat" "Cat_2"}})

(def ^:private join-internal-keys
  "Every internal key middleware adds to a join."
  {:qp/is-implicit-join                                                      true
   :qp/keep-default-join-alias                                               true
   :metabase.query-processor.middleware.add-implicit-joins/original-position 0
   :metabase.query-processor.util.add-alias-info/alias                       "Cat"
   :metabase.query-processor.util.add-alias-info/original-alias              "Cat"
   :metabase.lib.join/replace-alias                                          true})

(def ^:private clean-native-stage
  {:lib/type      :mbql.stage/native
   :native        "SELECT * FROM venues"
   :template-tags []})

(def ^:private clean-join
  {:lib/type   :mbql/join
   :alias      "Cat"
   :stages     [{:lib/type :mbql.stage/mbql, :source-table 2}]
   :conditions [[:= {:lib/uuid "00000000-0000-0000-0000-000000000002"}
                 [:field {:lib/uuid "00000000-0000-0000-0000-000000000003", :base-type :type/Integer} "ID"]
                 [:field {:lib/uuid  "00000000-0000-0000-0000-000000000004"
                          :base-type :type/Integer
                          :join-alias "Cat"}
                  "ID"]]]})

(def ^:private clean-mbql-stage
  {:lib/type :mbql.stage/mbql
   :fields   [[:field {:lib/uuid "00000000-0000-0000-0000-000000000001", :base-type :type/Integer} "ID"]]
   :joins    [clean-join]
   :limit    100})

(def ^:private clean-query
  "The fixture query with none of the internal keys on it -- what everything below should decode back down to.
  `:viz-settings` and `:user-parameters` are in here rather than with the internal keys because their names are not
  namespaced, so they survive decoding."
  {:lib/type        :mbql/query
   :database        1
   :stages          [clean-native-stage clean-mbql-stage]
   :parameters      []
   :viz-settings    {:column_settings {}}
   :user-parameters [{:type :category, :id "p1", :value 1}]
   :info            {:context :ad-hoc}})

(def ^:private query-internal-keys
  "Every internal key middleware adds to the top level of a query."
  {:lib.convert/converted?                   true
   :qp/compiled                              {:query "SELECT 1", :params [1]}
   :qp/compiled-inline                       {:query "SELECT 1"}
   :qp/source-card-id                        1
   :qp/skip-result-metadata-persistence      true
   :qp.pivot/unremapped-breakout-combination [0 1]
   :qp.pivot/remapped-breakout-combination   [0]
   :qp.pivot/num-remapped-cols               3
   :qp.pivot/num-unremapped-breakouts        2
   :qp.pivot/num-remapped-breakouts          3
   :qp.pivot/remapped-indexes                {0 1}
   :query-permissions/referenced-card-ids    #{1}
   :destination-database/id                  2
   :impersonation/role                       "analyst"
   :impersonation/admin?                     true
   :impersonation/allow-write?               false
   :metabase.query-processor.util.add-alias-info/original           clean-query
   :metabase.query-processor.middleware.add-remaps/external-remaps  [external-remap]
   :metabase-enterprise.sandbox.query-processor.middleware.sandboxing/original-metadata
   [{:name "ID", :display_name "ID", :base_type :type/Integer}]})

(def ^:private dirty-query
  "A realistic MBQL 5 query carrying every internal key declared on the query, stage, join and options schemas, the way
  it would look part-way through the query processor pipeline."
  (-> clean-query
      (merge query-internal-keys)
      (assoc-in [:stages 0] (merge clean-native-stage
                                   stage-internal-keys
                                   {:query-permissions/referenced-card-ids #{1}
                                    :qp/table-name                         "ORDERS"}))
      (assoc-in [:stages 1] (merge clean-mbql-stage stage-internal-keys))
      (assoc-in [:stages 1 :joins 0] (merge clean-join join-internal-keys))
      (assoc-in [:stages 1 :fields 0 1] (merge {:lib/uuid "00000000-0000-0000-0000-000000000001", :base-type :type/Integer}
                                               options-internal-keys))))

(def ^:private column-internal-keys
  "Every internal key Lib and the query processor add to a column metadata map -- the ones declared by this pass plus
  the handful that were already declared before it."
  {:qp/implicit-field?                                       true
   :qp/native-sandbox-column.force-coercion-strategy         :Coercion/UNIXSeconds->DateTime
   :qp/native-sandbox-column.propagate-coercion?             true
   :metabase.lib.metadata.result-metadata/field-ref          [:field 1 nil]
   :metabase.lib.metadata.result-metadata/source             :breakout
   :metabase.lib.metadata.result-metadata/remove-join-alias? true
   :metabase.lib.field.resolution/fallback-metadata?         true
   :metabase.driver.mongo.query-processor/source-alias       "ID"
   :metabase.driver.mongo.query-processor/join-field         "Cat"
   :metabase.driver.mongo.query-processor/inherited?         true
   :metabase.lib.join/target                                 {:lib/type  :metadata/column
                                                              :name      "CATEGORY"
                                                              :base-type :type/Text}
   :metabase.lib.underlying/original                         {:lib/type  :metadata/column
                                                              :name      "CATEGORY"
                                                              :base-type :type/Text}
   :metabase.lib.underlying/temporal-unit                    :month
   :metabase.lib.underlying/binning                          {:strategy :default}
   :metabase.lib.join/HACK-from-incomplete-join?             true
   :metabase.query-processor.pivot/idx                       0
   :dimension/id                                             1
   :dimension/name                                           "Category"
   :dimension/type                                           :external
   :dimension/human-readable-field-id                        2
   :values/values                                            [1 2]
   :values/human-readable-values                             ["One" "Two"]})

(def ^:private info-internal-keys
  "Every internal key added to a query's `:info`."
  {:metadata/own-model-query? true
   :metadata/model-metadata   [{:lib/type :metadata/column, :name "ID", :base-type :type/Integer}]
   :pivot/original-query      clean-query
   :pivot/result-metadata     :none})

(deftest ^:parallel internal-keys-fixture-covers-the-schemas-test
  (testing "the fixtures carry every internal key the schemas declare, so these tests cannot drift"
    (are [schema fixture-keys] (= #{} (set (remove (set fixture-keys) (declared-internal-keys schema))))
      ::lib.schema.common/options   (keys options-internal-keys)
      ::lib.schema.join/join        (keys join-internal-keys)
      ::lib.schema/query            (keys query-internal-keys)
      ::lib.schema/stage.common     (keys stage-internal-keys)
      ::lib.schema/stage.mbql       (keys stage-internal-keys)
      ::lib.schema/stage.native     (list* :query-permissions/referenced-card-ids :qp/table-name (keys stage-internal-keys))
      ::lib.schema.metadata/column  (keys column-internal-keys)
      ::lib.schema.info/info        (keys info-internal-keys))))

(deftest ^:parallel internal-keys-are-valid-mbql-test
  (testing "a query carrying all of these keys is still a valid MBQL 5 query -- i.e. the declared schemas match reality"
    (is (nil? (mr/explain ::lib.schema/query dirty-query)))))

(deftest ^:parallel strip-internal-keys-from-query-test
  (testing "prepare-after-deserialization strips every internal key and leaves the query itself alone"
    (is (= clean-query
           (lib.serialize/prepare-after-deserialization dirty-query)))))

(deftest ^:parallel strip-internal-keys-on-serialization-test
  (testing "prepare-for-serialization strips them too, plus the run-time-only keys it always drops"
    (is (= (dissoc clean-query :info :parameters :viz-settings)
           (lib.serialize/prepare-for-serialization dirty-query)))))

(deftest ^:parallel internal-keys-stripped-from-column-metadata-but-not-info-test
  (testing (str "internal keys declared on :metabase.lib.schema.metadata/column are stripped on deserialization while "
                "`lib`-namespaced keys stay; the ones on :metabase.lib.schema.info/info are set by the server on its own "
                "queries and survive")
    (let [clean-column {:lib/type  :metadata/column
                        :name      "ID"
                        :base-type :type/Integer
                        :lib/original-ref-style-for-result-metadata-purposes :original-ref-style/id}
          column       (merge clean-column column-internal-keys)
          query        (-> clean-query
                           (assoc-in [:stages 1 :lib/stage-metadata] {:lib/type :metadata/results, :columns [column]})
                           (update :info merge info-internal-keys))]
      (is (nil? (mr/explain ::lib.schema/query query)))
      (is (= (assoc-in query [:stages 1 :lib/stage-metadata :columns 0] clean-column)
             (lib.serialize/prepare-after-deserialization query))))))
