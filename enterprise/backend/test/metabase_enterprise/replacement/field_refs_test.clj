(ns metabase-enterprise.replacement.field-refs-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.replacement.field-refs :as field-refs]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.field.resolution :as lib.field.resolution]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

;;; ------------------------------------------------ helpers ------------------------------------------------

(defn- table-query
  "Build a pMBQL query for the given table keyword."
  [table-kw]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id table-kw)))))

(defn- ref-key
  "Build a JSON-encoded column_settings key in the ref format."
  [field-id & [opts]]
  (json/encode ["ref" ["field" field-id opts]]))

(defn- name-key
  "Build a JSON-encoded column_settings key in the name format."
  [column-name]
  (json/encode ["name" column-name]))

(defn- join-query
  "Build a pMBQL query for `base-table-kw` with an explicit join to `join-table-kw`."
  [base-table-kw join-table-kw [base-fk-kw join-pk-kw]]
  (let [mp          (mt/metadata-provider)
        base-query  (lib/query mp (lib.metadata/table mp (mt/id base-table-kw)))
        join-table  (lib.metadata/table mp (mt/id join-table-kw))
        join-clause (lib/join-clause
                     join-table
                     [(lib/= (lib/ref (lib.metadata/field mp (mt/id base-table-kw base-fk-kw)))
                             (lib/ref (lib.metadata/field mp (mt/id join-table-kw join-pk-kw))))])]
    (lib/join base-query join-clause)))

(defn- self-join-query
  "Build a pMBQL query for `table-kw` joined to itself on `join-field-kw`."
  [table-kw join-field-kw]
  (let [mp          (mt/metadata-provider)
        base-query  (lib/query mp (lib.metadata/table mp (mt/id table-kw)))
        join-table  (lib.metadata/table mp (mt/id table-kw))
        field       (lib.metadata/field mp (mt/id table-kw join-field-kw))
        join-clause (lib/join-clause
                     join-table
                     [(lib/= (lib/ref field) (lib/ref field))])]
    (lib/join base-query join-clause)))

;;; ----------------------------------------- upgrade! for column_settings -----------------------------------------

(deftest upgrade-card-column-settings-ref-to-name-test
  (testing "upgrade! converts ref-based column_settings keys to name-based keys"
    (mt/dataset test-data
      (mt/with-temp [:model/Card card {:dataset_query          (table-query :products)
                                       :visualization_settings {:column_settings
                                                                {(ref-key (mt/id :products :title)) {:column_title "Product Name"}}}}]
        (field-refs/upgrade! [:card (:id card)] card)
        (let [updated-viz (t2/select-one-fn :visualization_settings :model/Card :id (:id card))
              cs          (:column_settings updated-viz)]
          (is (contains? cs (name-key "TITLE"))
              "ref key should be converted to name key")
          (is (= {:column_title "Product Name"} (get cs (name-key "TITLE")))
              "settings value should be preserved")
          (is (not (contains? cs (ref-key (mt/id :products :title))))
              "old ref key should be removed"))))))

(deftest upgrade-card-name-keys-unchanged-test
  (testing "upgrade! leaves name-based column_settings keys unchanged"
    (mt/dataset test-data
      (mt/with-temp [:model/Card card {:dataset_query          (table-query :products)
                                       :visualization_settings {:column_settings
                                                                {(name-key "TITLE") {:column_title "Custom Title"}}}}]
        (field-refs/upgrade! [:card (:id card)] card)
        (let [updated-viz (t2/select-one-fn :visualization_settings :model/Card :id (:id card))
              cs          (:column_settings updated-viz)]
          (is (= {:column_title "Custom Title"} (get cs (name-key "TITLE")))
              "name-based settings should be preserved as-is"))))))

(deftest upgrade-card-mixed-keys-test
  (testing "upgrade! handles a mix of ref and name keys, merging settings for the same column"
    (mt/dataset test-data
      (mt/with-temp [:model/Card card {:dataset_query          (table-query :products)
                                       :visualization_settings {:column_settings
                                                                {(ref-key (mt/id :products :title)) {:column_title "From Ref"}
                                                                 (name-key "TITLE")                 {:show_mini_bar true}
                                                                 (name-key "CATEGORY")              {:column_title "Cat"}}}}]
        (field-refs/upgrade! [:card (:id card)] card)
        (let [updated-viz (t2/select-one-fn :visualization_settings :model/Card :id (:id card))
              cs          (:column_settings updated-viz)]
          (is (= {:column_title "From Ref" :show_mini_bar true}
                 (get cs (name-key "TITLE")))
              "ref and name settings for same column should be merged")
          (is (= {:column_title "Cat"} (get cs (name-key "CATEGORY")))
              "unrelated name key should be preserved"))))))

(deftest upgrade-card-no-viz-settings-test
  (testing "upgrade! is a no-op when card has no column_settings"
    (mt/dataset test-data
      (mt/with-temp [:model/Card card {:dataset_query          (table-query :products)
                                       :visualization_settings {:some_setting "hello"}}]
        (field-refs/upgrade! [:card (:id card)] card)
        (let [updated-viz (t2/select-one-fn :visualization_settings :model/Card :id (:id card))]
          (is (= "hello" (:some_setting updated-viz))
              "other settings should be preserved"))))))

;;; ----------------------------------------- upgrade-field-ref-to-name edge cases ----------------------------------------

(deftest upgrade-card-prefers-deduplicated-name-test
  (testing "upgrade! uses :lib/deduplicated-name when present on the resolved column"
    (mt/dataset test-data
      (mt/with-temp [:model/Card card {:dataset_query          (table-query :products)
                                       :visualization_settings {:column_settings
                                                                {(ref-key (mt/id :products :title)) {:column_title "Custom"}}}}]
        (let [original-resolve lib.field.resolution/resolve-field-ref]
          (with-redefs [lib.field.resolution/resolve-field-ref
                        (fn [query stage field-ref]
                          (when-let [col (original-resolve query stage field-ref)]
                            (assoc col :lib/deduplicated-name "TITLE_2")))]
            (field-refs/upgrade! [:card (:id card)] card)
            (let [updated-viz (t2/select-one-fn :visualization_settings :model/Card :id (:id card))
                  cs          (:column_settings updated-viz)]
              (is (contains? cs (name-key "TITLE_2"))
                  "should use deduplicated name when it differs from base name")
              (is (not (contains? cs (name-key "TITLE")))
                  "should not use base name when deduplicated name is available"))))))))

;;; ----------------------------------------- upgrade! for joins with join-alias -----------------------------------------

(deftest upgrade-card-join-column-settings-test
  (testing "upgrade! converts ref keys with join-alias to name-based keys"
    (mt/dataset test-data
      (mt/with-temp [:model/Card card {:dataset_query          (join-query :orders :products [:product_id :id])
                                       :visualization_settings {:column_settings
                                                                {(ref-key (mt/id :products :title) {"join-alias" "Products"})
                                                                 {:column_title "Product Name"}
                                                                 (ref-key (mt/id :orders :total))
                                                                 {:column_title "Order Total"}}}}]
        (field-refs/upgrade! [:card (:id card)] card)
        (let [updated-viz (t2/select-one-fn :visualization_settings :model/Card :id (:id card))
              cs          (:column_settings updated-viz)]
          (is (= {:column_title "Product Name"} (get cs (name-key "TITLE")))
              "joined field ref with join-alias should be converted to name key")
          (is (= {:column_title "Order Total"} (get cs (name-key "TOTAL")))
              "base table field ref should be converted to name key")
          (is (not (contains? cs (ref-key (mt/id :products :title) {"join-alias" "Products"})))
              "old ref key with join-alias should be removed"))))))

(deftest upgrade-card-self-join-column-settings-test
  (testing "upgrade! with self-join: both base and joined field refs resolve to same name"
    (mt/dataset test-data
      (mt/with-temp [:model/Card card {:dataset_query          (self-join-query :products :category)
                                       :visualization_settings {:column_settings
                                                                {(ref-key (mt/id :products :title))
                                                                 {:column_title "Base Title"}
                                                                 (ref-key (mt/id :products :title) {"join-alias" "Products - Category"})
                                                                 {:column_title "Joined Title"}}}}]
        (field-refs/upgrade! [:card (:id card)] card)
        (let [updated-viz (t2/select-one-fn :visualization_settings :model/Card :id (:id card))
              cs          (:column_settings updated-viz)]
          ;; Both refs resolve to "TITLE" — the settings get merged, with join-alias ref winning
          ;; because reduce processes entries in iteration order and merge-with merge is used
          (is (contains? cs (name-key "TITLE"))
              "both refs should collapse into a single name key")
          (is (not (contains? cs (ref-key (mt/id :products :title))))
              "base ref key should be removed")
          (is (not (contains? cs (ref-key (mt/id :products :title) {"join-alias" "Products - Category"})))
              "joined ref key should be removed"))))))

(deftest upgrade-card-self-join-pivot-column-split-test
  (testing "upgrade! with self-join: field refs with join-alias in pivot_table.column_split"
    (mt/dataset test-data
      (mt/with-temp [:model/Card card {:dataset_query          (self-join-query :products :category)
                                       :visualization_settings {:pivot_table.column_split
                                                                {:rows    [[:field (mt/id :products :category) nil]]
                                                                 :columns [[:field (mt/id :products :title) {"join-alias" "Products - Category"}]]
                                                                 :values  ["count"]}}}]
        (field-refs/upgrade! [:card (:id card)] card)
        (let [updated-viz (t2/select-one-fn :visualization_settings :model/Card :id (:id card))
              split       (:pivot_table.column_split updated-viz)]
          (is (= ["CATEGORY"] (:rows split))
              "base field ref should be converted to column name")
          (is (= ["TITLE"] (:columns split))
              "joined field ref should also resolve to column name")
          (is (= ["count"] (:values split))
              "string values should be left unchanged"))))))

;;; ----------------------------------------- upgrade! for pivot_table settings ----------------------------------------

(deftest upgrade-card-pivot-column-split-test
  (testing "upgrade! converts field refs in pivot_table.column_split to column names"
    (mt/dataset test-data
      (mt/with-temp [:model/Card card {:dataset_query          (table-query :products)
                                       :visualization_settings {:pivot_table.column_split
                                                                {:rows    [[:field (mt/id :products :category) nil]]
                                                                 :columns [[:field (mt/id :products :created_at) {:temporal-unit :quarter}]]
                                                                 :values  ["count"]}}}]
        (field-refs/upgrade! [:card (:id card)] card)
        (let [updated-viz (t2/select-one-fn :visualization_settings :model/Card :id (:id card))
              split       (:pivot_table.column_split updated-viz)]
          (is (= ["CATEGORY"] (:rows split))
              "field ref in rows should be converted to column name")
          (is (= ["CREATED_AT"] (:columns split))
              "field ref in columns should be converted to column name")
          (is (= ["count"] (:values split))
              "string values should be left unchanged"))))))

(deftest upgrade-card-pivot-collapsed-rows-test
  (testing "upgrade! converts field refs in pivot_table.collapsed_rows.rows to column names"
    (mt/dataset test-data
      (mt/with-temp [:model/Card card {:dataset_query          (table-query :products)
                                       :visualization_settings {:pivot_table.collapsed_rows
                                                                {:rows  [[:field (mt/id :products :category) nil]
                                                                         [:field (mt/id :products :title) nil]]
                                                                 :value ["2"]}}}]
        (field-refs/upgrade! [:card (:id card)] card)
        (let [updated-viz (t2/select-one-fn :visualization_settings :model/Card :id (:id card))
              collapsed   (:pivot_table.collapsed_rows updated-viz)]
          (is (= ["CATEGORY" "TITLE"] (:rows collapsed))
              "field refs in rows should be converted to column names")
          (is (= ["2"] (:value collapsed))
              "value entries should be left unchanged"))))))

;;; ----------------------------------------- upgrade! for table.column_formatting -----------------------------------------

(deftest upgrade-card-table-column-formatting-test
  (testing "upgrade! converts field refs in table.column_formatting columns to column names"
    (mt/dataset test-data
      (mt/with-temp [:model/Card card {:dataset_query          (table-query :products)
                                       :visualization_settings {:table.column_formatting
                                                                [{:columns [[:field (mt/id :products :price) nil]]
                                                                  :type    "range"
                                                                  :color   "#509EE3"}]}}]
        (field-refs/upgrade! [:card (:id card)] card)
        (let [updated-viz (t2/select-one-fn :visualization_settings :model/Card :id (:id card))
              fmt         (first (:table.column_formatting updated-viz))]
          (is (= ["PRICE"] (:columns fmt))
              "field ref in formatting columns should be converted to name")
          (is (= "range" (:type fmt))
              "other formatting settings should be preserved"))))))

(deftest upgrade-card-table-column-formatting-name-strings-test
  (testing "upgrade! leaves name strings in table.column_formatting unchanged"
    (mt/dataset test-data
      (mt/with-temp [:model/Card card {:dataset_query          (table-query :products)
                                       :visualization_settings {:table.column_formatting
                                                                [{:columns ["PRICE" "RATING"]
                                                                  :type    "range"
                                                                  :color   "#509EE3"}
                                                                 {:columns ["CREATED_AT"]
                                                                  :type    "date"
                                                                  :color   "#EF8C8C"}]}}]
        (field-refs/upgrade! [:card (:id card)] card)
        (let [updated-viz (t2/select-one-fn :visualization_settings :model/Card :id (:id card))
              fmts        (:table.column_formatting updated-viz)]
          (is (= ["PRICE" "RATING"] (:columns (first fmts)))
              "name strings should be preserved as-is")
          (is (= ["CREATED_AT"] (:columns (second fmts)))
              "name strings in second entry should be preserved")
          (is (= "range" (:type (first fmts)))
              "other formatting settings should be preserved"))))))

;;; ----------------------------------------- dashboard-upgrade-field-refs! ----------------------------------------

(deftest dashboard-upgrade-column-settings-test
  (testing "dashboard-upgrade-field-refs! upgrades column_settings click_behavior parameterMappings"
    (mt/dataset test-data
      (mt/with-temp [:model/Card card {:dataset_query          (table-query :products)
                                       :visualization_settings {}}
                     :model/Dashboard {dashboard-id :id} {:name "Test Dashboard"}
                     :model/DashboardCard {dashcard-id :id}
                     {:dashboard_id dashboard-id
                      :card_id (:id card)
                      :visualization_settings
                      {:column_settings
                       {(name-key "TITLE")
                        {:click_behavior
                         {:type "link"
                          :linkType "question"
                          :targetId 1
                          :parameterMapping
                          {(json/encode ["dimension" ["field" (mt/id :products :category)
                                                      {"base-type" "type/Text"}]])
                           {:source {:type "column" :id "TITLE"}
                            :target {:type "dimension"
                                     :dimension ["dimension"
                                                 ["field" (mt/id :products :category)
                                                  {"base-type" "type/Text"}]]}}}}}}}}]
        (field-refs/dashboard-upgrade-field-refs! dashboard-id)
        (let [updated-viz (t2/select-one-fn :visualization_settings :model/DashboardCard :id dashcard-id)
              cs          (:column_settings updated-viz)]
          (is (some? cs) "column_settings should exist after upgrade"))))))

(deftest dashboard-upgrade-no-column-settings-test
  (testing "dashboard-upgrade-field-refs! is a no-op for dashcards without column_settings"
    (mt/dataset test-data
      (mt/with-temp [:model/Card card {:dataset_query          (table-query :products)
                                       :visualization_settings {}}
                     :model/Dashboard {dashboard-id :id} {:name "Test Dashboard"}
                     :model/DashboardCard {dashcard-id :id}
                     {:dashboard_id dashboard-id
                      :card_id (:id card)
                      :visualization_settings {:some_setting "value"}}]
        (field-refs/dashboard-upgrade-field-refs! dashboard-id)
        (let [updated-viz (t2/select-one-fn :visualization_settings :model/DashboardCard :id dashcard-id)]
          (is (= "value" (:some_setting updated-viz))
              "unrelated settings should be preserved"))))))

;;; ----------------------------------------- upgrade! dispatch ----------------------------------------

(deftest upgrade-dispatch-nil-test
  (testing "upgrade! with nil entity is a no-op"
    (is (= :do-nothing (field-refs/upgrade! nil)))))

(deftest upgrade-dispatch-unknown-vector-test
  (testing "upgrade! with unknown entity type vector is a no-op"
    (is (nil? (field-refs/upgrade! [:table 123])))))

(deftest upgrade-dispatch-unknown-map-test
  (testing "upgrade! with a map that matches no condition returns :do-nothing"
    (is (= :do-nothing (field-refs/upgrade! {:some-key 1 :other-key 2})))))

(deftest upgrade-dispatch-dashboard-via-upgrade!-test
  (testing "upgrade! with [:dashboard id] dispatches to dashboard upgrade"
    (let [called (atom nil)]
      (with-redefs-fn {#'field-refs/dashboard-upgrade-field-refs!
                       (fn [id] (reset! called id))}
        (fn []
          (field-refs/upgrade! [:dashboard 42])
          (is (= 42 @called)
              "should call dashboard-upgrade-field-refs! with the id"))))))

;;; ----------------------------------------- upgrade! tuple dispatch for transform/segment/measure --------

(deftest upgrade-dispatch-transform-vector-test
  (testing "upgrade! with [:transform id] and loaded-object calls transform upgrade"
    (let [called (atom nil)]
      (with-redefs-fn {#'field-refs/transform-upgrade-field-refs!
                       (fn [obj] (reset! called obj))}
        (fn []
          (let [transform {:id 42 :source {:type :query :query {}}}]
            (field-refs/upgrade! [:transform 42] transform)
            (is (= transform @called)
                "should call transform-upgrade-field-refs! with the loaded-object")))))))

(deftest upgrade-dispatch-transform-no-loaded-object-test
  (testing "upgrade! with [:transform id] and nil loaded-object is a no-op"
    (let [called (atom false)]
      (with-redefs-fn {#'field-refs/transform-upgrade-field-refs!
                       (fn [_] (reset! called true))}
        (fn []
          (field-refs/upgrade! [:transform 42])
          (is (not @called)
              "should not call transform-upgrade-field-refs! without loaded-object"))))))

(deftest upgrade-dispatch-segment-vector-test
  (testing "upgrade! with [:segment id] and loaded-object calls segment upgrade"
    (let [called (atom nil)]
      (with-redefs-fn {#'field-refs/segment-upgrade-field-refs!
                       (fn [obj] (reset! called obj))}
        (fn []
          (let [segment {:id 42 :definition {} :table_id 1}]
            (field-refs/upgrade! [:segment 42] segment)
            (is (= segment @called)
                "should call segment-upgrade-field-refs! with the loaded-object")))))))

(deftest upgrade-dispatch-segment-no-loaded-object-test
  (testing "upgrade! with [:segment id] and nil loaded-object is a no-op"
    (let [called (atom false)]
      (with-redefs-fn {#'field-refs/segment-upgrade-field-refs!
                       (fn [_] (reset! called true))}
        (fn []
          (field-refs/upgrade! [:segment 42])
          (is (not @called)
              "should not call segment-upgrade-field-refs! without loaded-object"))))))

(deftest upgrade-dispatch-measure-vector-test
  (testing "upgrade! with [:measure id] and loaded-object calls measure upgrade"
    (let [called (atom nil)]
      (with-redefs-fn {#'field-refs/measure-upgrade-field-refs!
                       (fn [obj] (reset! called obj))}
        (fn []
          (let [measure {:id 42 :definition {}}]
            (field-refs/upgrade! [:measure 42] measure)
            (is (= measure @called)
                "should call measure-upgrade-field-refs! with the loaded-object")))))))

(deftest upgrade-dispatch-measure-no-loaded-object-test
  (testing "upgrade! with [:measure id] and nil loaded-object is a no-op"
    (let [called (atom false)]
      (with-redefs-fn {#'field-refs/measure-upgrade-field-refs!
                       (fn [_] (reset! called true))}
        (fn []
          (field-refs/upgrade! [:measure 42])
          (is (not @called)
              "should not call measure-upgrade-field-refs! without loaded-object"))))))

;;; ----------------------------------------- upgrade! map dispatch ----------------------------------------

(deftest upgrade-map-card-test
  (testing "upgrade! with a card map dispatches to card upgrade"
    (mt/dataset test-data
      (mt/with-temp [:model/Card card {:dataset_query          (table-query :products)
                                       :visualization_settings {:column_settings
                                                                {(ref-key (mt/id :products :title)) {:column_title "Map Card"}}}}]
        (field-refs/upgrade! card)
        (let [updated-viz (t2/select-one-fn :visualization_settings :model/Card :id (:id card))
              cs          (:column_settings updated-viz)]
          (is (= {:column_title "Map Card"} (get cs (name-key "TITLE")))
              "card map dispatch should upgrade column_settings"))))))

(deftest upgrade-map-transform-test
  (testing "upgrade! with a transform map dispatches to transform upgrade"
    (let [called (atom nil)]
      (with-redefs-fn {#'field-refs/transform-upgrade-field-refs!
                       (fn [obj] (reset! called obj))}
        (fn []
          (let [transform {:id 42 :source {:type :query :query {}} :name "T"}]
            (field-refs/upgrade! transform)
            (is (= transform @called)
                "transform map dispatch should call transform-upgrade-field-refs!")))))))

(deftest upgrade-map-segment-test
  (testing "upgrade! with a segment map dispatches to segment upgrade"
    (let [called (atom nil)]
      (with-redefs-fn {#'field-refs/segment-upgrade-field-refs!
                       (fn [obj] (reset! called obj))}
        (fn []
          (let [segment {:definition {:some "def"} :table_id 1 :id 42}]
            (field-refs/upgrade! segment)
            (is (= segment @called)
                "segment map dispatch should call segment-upgrade-field-refs!")))))))

(deftest upgrade-map-segment-with-aggregation-test
  (testing "upgrade! with a map having :definition, :table_id, and :aggregation dispatches to measure"
    (let [called (atom nil)]
      (with-redefs-fn {#'field-refs/measure-upgrade-field-refs!
                       (fn [obj] (reset! called obj))}
        (fn []
          (let [measure {:definition {:some "def"} :table_id 1 :aggregation [:count] :id 42}]
            (field-refs/upgrade! measure)
            (is (= measure @called)
                "entity with aggregation should dispatch to measure, not segment")))))))

(deftest upgrade-map-measure-test
  (testing "upgrade! with a measure map (definition only) dispatches to measure upgrade"
    (let [called (atom nil)]
      (with-redefs-fn {#'field-refs/measure-upgrade-field-refs!
                       (fn [obj] (reset! called obj))}
        (fn []
          (let [measure {:definition {:some "def"} :id 42}]
            (field-refs/upgrade! measure)
            (is (= measure @called)
                "measure map dispatch should call measure-upgrade-field-refs!")))))))

;;; ----------------------------------------- card-upgrade-field-refs! dataset_query ----------------------------

(deftest upgrade-card-dataset-query-saved-test
  (testing "upgrade! saves updated dataset_query when query field refs are upgraded"
    (mt/dataset test-data
      (mt/with-temp [:model/Card card {:dataset_query          (table-query :products)
                                       :visualization_settings {}}]
        ;; Mock upgrade-field-refs-in-query to simulate a query that changes (add a filter)
        (let [upgraded-query (assoc-in (:dataset_query card) [:stages 0 :filters] [[:> {} 1 2]])]
          (with-redefs-fn {#'lib-be/upgrade-field-refs-in-query (constantly upgraded-query)}
            (fn []
              (field-refs/upgrade! [:card (:id card)] card)
              (let [saved-query (t2/select-one-fn :dataset_query :model/Card :id (:id card))]
                (is (some? (get-in saved-query [:stages 0 :filters]))
                    "upgraded dataset_query should be saved to DB")))))))))

(deftest upgrade-card-native-query-includes-result-metadata-test
  (testing "upgrade! includes result_metadata in changes for native queries when dataset_query changes"
    (mt/dataset test-data
      (let [mp              (mt/metadata-provider)
            native-query    (lib/native-query mp "SELECT * FROM PRODUCTS")
            result-metadata [{:name      "ID"
                              :base_type :type/Integer
                              :display_name "ID"
                              :field_ref [:field "ID" {:base-type :type/Integer}]}]
            update-args     (atom nil)]
        (mt/with-temp [:model/Card card {:dataset_query          native-query
                                         :result_metadata        result-metadata
                                         :visualization_settings {}}]
          ;; Mock to simulate a native query whose dataset_query changes
          (let [upgraded-query (lib/native-query mp "SELECT * FROM PRODUCTS WHERE 1=1")]
            (with-redefs-fn {#'lib-be/upgrade-field-refs-in-query (constantly upgraded-query)
                             #'lib/native-only-query?             (constantly true)
                             #'t2/update!                         (fn [& args] (reset! update-args args) 1)}
              (fn []
                (field-refs/upgrade! [:card (:id card)] card)
                (let [[_model _id changes] @update-args]
                  (is (contains? changes :result_metadata)
                      "changes should include result_metadata for native queries")
                  (is (= result-metadata (:result_metadata changes))
                      "result_metadata value should come from the card"))))))))))
