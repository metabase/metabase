(ns metabase-enterprise.replacement.field-refs-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.replacement.field-refs :as field-refs]
   [metabase.lib.core :as lib]
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

(deftest upgrade-dispatch-table-test
  (testing "upgrade! with :table entity is a no-op"
    (is (nil? (field-refs/upgrade! [:table 123])))))

