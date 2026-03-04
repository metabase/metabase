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

(defn- model-sourced-query
  "Build a pMBQL query that sources from a model card. This produces queries
   where upgrade-field-ref-in-parameter-target actually converts ID-based refs to name-based."
  [model-card-id]
  (let [mp (lib.metadata/->metadata-provider (mt/metadata-provider) model-card-id)]
    (lib/query mp (lib.metadata/card mp model-card-id))))

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

(deftest dashboard-upgrade-parameter-mappings-test
  (testing "dashboard-upgrade-field-refs! upgrades parameter_mappings targets from ID-based to name-based"
    (mt/dataset test-data
      (mt/with-temp [:model/Card model {:type :model
                                        :dataset_query (table-query :products)}
                     :model/Card question {:dataset_query (model-sourced-query (:id model))}
                     :model/Dashboard {dashboard-id :id} {:name "Test Dashboard"}
                     :model/DashboardCard {dashcard-id :id}
                     {:dashboard_id dashboard-id
                      :card_id (:id question)
                      :parameter_mappings [{:card_id (:id question)
                                            :parameter_id "abc"
                                            :target [:dimension
                                                     [:field (mt/id :products :category)
                                                      {:base-type :type/Text}]]}]}]
        (field-refs/dashboard-upgrade-field-refs! dashboard-id)
        (let [updated-pms (t2/select-one-fn :parameter_mappings :model/DashboardCard :id dashcard-id)
              pm          (first updated-pms)
              field-ref   (get-in pm [:target 1])]
          (is (some? pm) "parameter_mapping should exist after upgrade")
          (is (= "CATEGORY" (nth field-ref 1))
              "field ref should be upgraded to use column name"))))))

(deftest dashboard-upgrade-column-settings-dimension-refs-test
  (testing "dashboard-upgrade-field-refs! upgrades dimension refs in column_settings values"
    (mt/dataset test-data
      (mt/with-temp [:model/Card model {:type :model
                                        :dataset_query (table-query :products)}
                     :model/Card question {:dataset_query (model-sourced-query (:id model))}
                     :model/Dashboard {dashboard-id :id} {:name "Test Dashboard"}
                     :model/DashboardCard {dashcard-id :id}
                     {:dashboard_id dashboard-id
                      :card_id (:id question)
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
              cs          (:column_settings updated-viz)
              title-settings (get cs (name-key "TITLE"))
              pm-val      (first (vals (:parameterMapping (:click_behavior title-settings))))
              dim         (get-in pm-val [:target :dimension])]
          (is (some? dim) "dimension target should exist after upgrade")
          (is (= "CATEGORY" (nth (second dim) 1))
              "dimension field ref should be upgraded to use column name"))))))

(deftest dashboard-upgrade-preserves-unchanged-parameter-mappings-test
  (testing "dashboard-upgrade-field-refs! preserves parameter_mappings when card_id doesn't match"
    (mt/dataset test-data
      (mt/with-temp [:model/Card model {:type :model
                                        :dataset_query (table-query :products)}
                     :model/Card question {:dataset_query (model-sourced-query (:id model))}
                     :model/Dashboard {dashboard-id :id} {:name "Test Dashboard"}
                     :model/DashboardCard {dashcard-id :id}
                     {:dashboard_id dashboard-id
                      :card_id (:id question)
                      :parameter_mappings [{:parameter_id "abc"
                                            :target [:dimension
                                                     [:field (mt/id :products :category)
                                                      {:base-type :type/Text}]]}]}]
        ;; No :card_id on the parameter_mapping, so it won't be upgraded
        (field-refs/dashboard-upgrade-field-refs! dashboard-id)
        (let [updated-pms (t2/select-one-fn :parameter_mappings :model/DashboardCard :id dashcard-id)
              pm          (first updated-pms)]
          (is (= [:dimension [:field (mt/id :products :category) {:base-type :type/Text}]]
                 (:target pm))
              "parameter_mapping without card_id should be preserved as-is"))))))

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

(deftest dashboard-upgrade-pm-card-id-differs-from-dashcard-test
  (testing "dashboard-upgrade-field-refs! uses pm's :card_id (not dashcard's) to look up the query for each pm"
    (mt/dataset test-data
      (mt/with-temp [:model/Card model {:type :model
                                        :dataset_query (table-query :products)}
                     :model/Card pm-card {:dataset_query (model-sourced-query (:id model))}
                     :model/Card dashcard-card {:dataset_query (table-query :orders)}
                     :model/Dashboard {dashboard-id :id} {:name "Test Dashboard"}
                     :model/DashboardCard {dashcard-id :id}
                     {:dashboard_id dashboard-id
                      :card_id (:id dashcard-card)
                      :parameter_mappings [{:card_id (:id pm-card)
                                            :parameter_id "abc"
                                            :target [:dimension
                                                     [:field (mt/id :products :category)
                                                      {:base-type :type/Text}]]}]}]
        (field-refs/dashboard-upgrade-field-refs! dashboard-id)
        (let [updated-pms (t2/select-one-fn :parameter_mappings :model/DashboardCard :id dashcard-id)
              pm          (first updated-pms)
              field-ref   (get-in pm [:target 1])]
          (is (= "CATEGORY" (nth field-ref 1))
              "pm's card_id should be used to load the query for upgrading the pm's target"))))))

(deftest dashboard-upgrade-virtual-card-preserves-column-settings-test
  (testing "dashboard-upgrade-field-refs! preserves column_settings when dashcard has no primary card"
    (mt/dataset test-data
      (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Test Dashboard"}
                     :model/DashboardCard {dashcard-id :id}
                     {:dashboard_id dashboard-id
                      :card_id nil
                      :visualization_settings {:column_settings
                                               {(name-key "TOTAL") {:column_title "Grand Total"}}}}]
        (field-refs/dashboard-upgrade-field-refs! dashboard-id)
        (let [updated-viz (t2/select-one-fn :visualization_settings :model/DashboardCard :id dashcard-id)
              cs          (:column_settings updated-viz)]
          (is (= {:column_title "Grand Total"} (get cs (name-key "TOTAL")))
              "column_settings should be preserved when there is no primary card"))))))

(deftest dashboard-upgrade-no-unnecessary-writes-test
  (testing "dashboard-upgrade-field-refs! does not write when nothing changes"
    (mt/dataset test-data
      (mt/with-temp [:model/Card card {:dataset_query (table-query :products)}
                     :model/Dashboard {dashboard-id :id} {:name "Test Dashboard"}
                     :model/DashboardCard {dashcard-id :id}
                     {:dashboard_id dashboard-id
                      :card_id (:id card)
                      :parameter_mappings []
                      :visualization_settings {:some_setting "value"}}]
        (let [original-update! t2/update!
              update-calls     (atom [])]
          (with-redefs [t2/update! (fn [model id changes]
                                     (swap! update-calls conj {:model model :id id :changes changes})
                                     (original-update! model id changes))]
            (field-refs/dashboard-upgrade-field-refs! dashboard-id))
          (is (empty? @update-calls)
              "no updates should be made when nothing needs upgrading"))))))

(deftest dashboard-upgrade-preserves-other-viz-settings-test
  (testing "dashboard-upgrade-field-refs! preserves non-column_settings viz settings when upgrading"
    (mt/dataset test-data
      (mt/with-temp [:model/Card model {:type :model
                                        :dataset_query (table-query :products)}
                     :model/Card question {:dataset_query (model-sourced-query (:id model))}
                     :model/Dashboard {dashboard-id :id} {:name "Test Dashboard"}
                     :model/DashboardCard {dashcard-id :id}
                     {:dashboard_id dashboard-id
                      :card_id (:id question)
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
                                                  {"base-type" "type/Text"}]]}}}}}}
                       :graph.show_trendline true
                       :table.pivot false}}]
        (field-refs/dashboard-upgrade-field-refs! dashboard-id)
        (let [updated-viz (t2/select-one-fn :visualization_settings :model/DashboardCard :id dashcard-id)]
          (is (true? (:graph.show_trendline updated-viz))
              "graph.show_trendline should be preserved")
          (is (false? (:table.pivot updated-viz))
              "table.pivot should be preserved"))))))

(deftest dashboard-upgrade-column-settings-base-type-keyword-test
  (testing "dashboard-upgrade-field-refs! correctly handles :base-type keyword conversion in dimension refs"
    (mt/dataset test-data
      (mt/with-temp [:model/Card model {:type :model
                                        :dataset_query (table-query :products)}
                     :model/Card question {:dataset_query (model-sourced-query (:id model))}
                     :model/Dashboard {dashboard-id :id} {:name "Test Dashboard"}
                     :model/DashboardCard {dashcard-id :id}
                     {:dashboard_id dashboard-id
                      :card_id (:id question)
                      :visualization_settings
                      {:column_settings
                       {(name-key "PRICE")
                        {:click_behavior
                         {:type "link"
                          :linkType "question"
                          :targetId 1
                          :parameterMapping
                          {(json/encode ["dimension" ["field" (mt/id :products :price)
                                                      {"base-type" "type/Float"}]])
                           {:source {:type "column" :id "PRICE"}
                            :target {:type "dimension"
                                     :dimension ["dimension"
                                                 ["field" (mt/id :products :price)
                                                  {"base-type" "type/Float"}]]}}}}}}}}]
        (field-refs/dashboard-upgrade-field-refs! dashboard-id)
        (let [updated-viz (t2/select-one-fn :visualization_settings :model/DashboardCard :id dashcard-id)
              cs          (:column_settings updated-viz)
              price-settings (get cs (name-key "PRICE"))
              pm-val      (first (vals (:parameterMapping (:click_behavior price-settings))))
              dim         (get-in pm-val [:target :dimension])]
          (is (some? dim) "dimension target should exist after upgrade")
          (is (= "PRICE" (nth (second dim) 1))
              "dimension with base-type should be upgraded to column name"))))))

(deftest dashboard-upgrade-invalid-dimension-form-preserved-test
  (testing "dashboard-upgrade-field-refs! preserves invalid dimension forms via catch block"
    (mt/dataset test-data
      (mt/with-temp [:model/Card model {:type :model
                                        :dataset_query (table-query :products)}
                     :model/Card question {:dataset_query (model-sourced-query (:id model))}
                     :model/Dashboard {dashboard-id :id} {:name "Test Dashboard"}
                     :model/DashboardCard {dashcard-id :id}
                     {:dashboard_id dashboard-id
                      :card_id (:id question)
                      :visualization_settings
                      {:column_settings
                       {(name-key "TITLE")
                        {:click_behavior
                         {:type "link"
                          :linkType "question"
                          :targetId 1
                          :parameterMapping
                          {"bad-key"
                           {:source {:type "column" :id "TITLE"}
                            :target {:type "dimension"
                                     :dimension ["dimension" "not-a-valid-field-ref"]}}}}}}}}]
        (field-refs/dashboard-upgrade-field-refs! dashboard-id)
        (let [updated-viz (t2/select-one-fn :visualization_settings :model/DashboardCard :id dashcard-id)
              cs          (:column_settings updated-viz)
              title-settings (get cs (name-key "TITLE"))
              pm-val      (get-in title-settings [:click_behavior :parameterMapping "bad-key"])
              dim         (get-in pm-val [:target :dimension])]
          (is (= ["dimension" "not-a-valid-field-ref"] dim)
              "invalid dimension form should be preserved as-is via catch block"))))))

(deftest upgrade-dispatch-nil-test
  (testing "upgrade! with nil entity is a no-op"
    (is (= :do-nothing (field-refs/upgrade! nil)))))

(deftest upgrade-dispatch-unknown-vector-test
  (testing "upgrade! with unknown entity type vector is a no-op"
    (is (nil? (field-refs/upgrade! [:table 123])))))
