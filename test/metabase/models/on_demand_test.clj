(ns metabase.models.on-demand-test
  "Tests for On-Demand FieldValues updating behavior for Cards and Dashboards."
  (:require [expectations :refer :all]
            [metabase.models
             [card :refer [Card]]
             [dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]
             [database :refer [Database]]
             [field :refer [Field]]
             [field-values :as field-values]
             [table :refer [Table]]]
            [metabase.test.util :as tu]
            [toucan.util.test :as tt]
            [metabase.util :as u]
            [toucan.db :as db]))

(defn- do-with-mocked-field-values-updating {:style/indent 0} [f]
  (let [updated-fields (atom #{})]
    (with-redefs [field-values/create-or-update-field-values! (fn [field]
                                                                (swap! updated-fields conj (:name field)))]
      (f updated-fields))))

(def ^:private basic-native-query
  {:database 1
   :type     "native"
   :native   {:query "SELECT AVG(SUBTOTAL) AS \"Average Price\"\nFROM ORDERS"}})

(defn- native-query-with-template-tag [field-or-id]
  {:database 1
   :type     "native"
   :native   {:query         "SELECT AVG(SUBTOTAL) AS \"Average Price\"\nFROM ORDERS nWHERE {{category}}"
              :template_tags {:category {:name         "category"
                                         :display_name "Category"
                                         :type         "dimension"
                                         :dimension    ["field-id" (u/get-id field-or-id)]
                                         :widget_type  "category"
                                         :default      "Widget"}}}})

(defn- do-with-category-field {:style/indent 1} [options & [f]]
  (tt/with-temp* [Database [db    (:db options)]
                  Table    [table (merge {:db_id (u/get-id db)}
                                         (:table options))]
                  Field    [field (merge {:table_id (u/get-id table), :special_type "type/Category"}
                                         (:field options))]]
    (when f
      (f db table field))))

(defn- do-with-updated-fields-for-parameterized-sql-card {:style/indent 1} [options & [f]]
  (do-with-category-field options
    (fn [db table field]
      (do-with-mocked-field-values-updating
       (fn [updated-field-names]
         (tt/with-temp Card [card (merge {:dataset_query (native-query-with-template-tag field)}
                                         (:card options))]
           (when f
             (f db table field card updated-field-names))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     CARDS                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- field-values-were-updated-for-new-card? [options]
  (do-with-updated-fields-for-parameterized-sql-card options
    (fn [_ _ _ _ updated-field-names]
      (not (empty? @updated-field-names)))))

;; Newly created Card with param referencing Field in On-Demand DB should get updated FieldValues
(expect
  (field-values-were-updated-for-new-card? {:db {:is_on_demand true}}))

;; Newly created Card with param referencing Field in non-On-Demand DB should *not* get updated FieldValues
(expect
  false
  (field-values-were-updated-for-new-card? {:db {:is_on_demand false}}))

;; Existing Card with unchanged param referencing Field in On-Demand DB should *not* get updated FieldValues
(expect
  #{}
  ;; create Parameterized Card with field in On-Demand DB
  (do-with-updated-fields-for-parameterized-sql-card {:db {:is_on_demand true}}
    (fn [_ _ _ card updated-field-names]
      ;; clear out the list of updated field names
      (reset! updated-field-names #{})
      ;; now update the Card... since param didn't change at all FieldValues should not be updated
      (db/update! Card (u/get-id card) card)
      @updated-field-names)))

;; Existing Card with changed param referencing Field in On-Demand DB should get updated FieldValues
(expect
  #{"New Field"}
  ;; create parameterized Card with Field in On-Demand DB
  (do-with-updated-fields-for-parameterized-sql-card {:db {:is_on_demand true}}
    (fn [_ table _ card updated-field-names]
      ;; clear out the list of updated field names
      (reset! updated-field-names #{})
      ;; now Change the Field that is referenced by the Card's SQL param
      (tt/with-temp Field [new-field {:table_id (u/get-id table), :special_type "type/Category", :name "New Field"}]
        (db/update! Card (u/get-id card)
          :dataset_query (native-query-with-template-tag new-field)))
      ;; This newly referenced Field should get updated values
      @updated-field-names)))

;; Existing Card with newly added param referencing Field in On-Demand DB should get updated FieldValues
(expect
  #{"New Field"}
  ;; create a Card with non-parameterized query
  (do-with-updated-fields-for-parameterized-sql-card {:db    {:is_on_demand true}
                                                      :card  {:dataset_query basic-native-query}
                                                      :field {:name "New Field"}}
    (fn [_ table field card updated-field-names]
      ;; now change the query to one that references our Field in a on-demand DB. Field should have updated values
      (db/update! Card (u/get-id card)
        :dataset_query (native-query-with-template-tag field))
      @updated-field-names)))

;; Existing Card with unchanged param referencing Field in non-On-Demand DB should *not* get updated FieldValues
(expect
  #{}
  ;; create a parameterized Card with a Field that belongs to a non-on-demand DB
  (do-with-updated-fields-for-parameterized-sql-card {:db {:is_on_demand false}}
    (fn [_ _ _ card updated-field-names]
      ;; update the Card. Field should get updated values
      (db/update! Card (u/get-id card) card)
      @updated-field-names)))

;; Existing Card with newly added param referencing Field in non-On-Demand DB should *not* get updated FieldValues
(expect
  #{}
  ;; create a Card with non-parameterized query
  (do-with-updated-fields-for-parameterized-sql-card {:db   {:is_on_demand false}
                                                      :card {:dataset_query basic-native-query}}
    (fn [_ _ field card updated-field-names]
      ;; now change the query to one that references a Field
      (db/update! Card (u/get-id card)
        :dataset_query (native-query-with-template-tag field))
      ;; Field should not get values since DB is not On-Demand
      @updated-field-names)))

;; Existing Card with changed param referencing Field in non-On-Demand DB should *not* get updated FieldValues
(expect
  #{}
  ;; create a parameterized Card with a Field that belongs to a non-on-demand DB
  (do-with-updated-fields-for-parameterized-sql-card {:db {:is_on_demand false}}
    (fn [_ table _ card updated-field-names]
      ;; change the query to one referencing a different Field
      (tt/with-temp Field [new-field {:table_id (u/get-id table), :special_type "type/Category", :name "New Field"}]
        (db/update! Card (u/get-id card)
          :dataset_query (native-query-with-template-tag new-field)))
      ;; Field should not get values since DB is not On-Demand
      @updated-field-names)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   DASHBOARDS                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private basic-mbql-query
  {:database 1
   :type     :query
   :query    {:source_table 1
              :aggregation  [["count"]]}})

(defn- add-dashcard-with-parameter-mapping! [dashboard-or-id card-or-id field-or-id]
  (db/insert! DashboardCard
    :dashboard_id      (u/get-id dashboard-or-id)
    :card_id           (u/get-id card-or-id)
    :parameter_mappings [{:card_id (u/get-id card-or-id)
                          :target  ["dimension" ["field-id" (u/get-id field-or-id)]]}]))

(defn- x []
  (do-with-updated-fields-for-parameterized-sql-card {:db   {:is_on_demand true}
                                                      :card {:dataset_query basic-mbql-query}}
    (fn [_ _ field card updated-field-names]
      (tt/with-temp Dashboard [dash]
        (add-dashcard-with-parameter-mapping! dash card field))
      @updated-field-names)))

;; TODO Newly created Dashboard with param referencing Field in On-Demand DB should get updated FieldValues

;; TODO Newly created Dashboard with param referencing Field in non-On-Demand DB should *not* get updated FieldValues

;; TODO Existing Dashboard with unchanged param referencing Field in On-Demand DB should *not* get updated FieldValues

;; TODO Existing Dashboard with newly added param referencing Field in On-Demand DB should get updated FieldValues

;; TODO Existing Dashboard with changed referencing Field in On-Demand DB should get updated FieldValues

;; TODO Existing Dashboard with unchanged param referencing Field in non-On-Demand DB should *not* get updated FieldValues

;; TODO Existing Dashboard with newly added param referencing Field in non-On-Demand DB should *not* get updated FieldValues

;; TODO Existing Dashboard with changed param referencing Field in non-On-Demand DB should *not* get updated FieldValues
