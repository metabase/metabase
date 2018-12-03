(ns metabase.models.on-demand-test
  "Tests for On-Demand FieldValues updating behavior for Cards and Dashboards."
  (:require [expectations :refer :all]
            [metabase.models
             [card :refer [Card]]
             [dashboard :as dashboard :refer [Dashboard]]
             [database :refer [Database]]
             [field :refer [Field]]
             [field-values :as field-values]
             [table :refer [Table]]]
            [metabase.test.data :as data]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn- do-with-mocked-field-values-updating
  "Run F the function responsible for updating FieldValues bound to a mock function that instead just records the names
  of Fields that should have been updated. Returns the set of updated Field names."
  {:style/indent 0}
  [f]
  (let [updated-field-names (atom #{})]
    (with-redefs [field-values/create-or-update-field-values! (fn [field]
                                                                (swap! updated-field-names conj (:name field)))]
      (f updated-field-names)
      @updated-field-names)))

(defn- basic-native-query []
  {:database (data/id)
   :type     "native"
   :native   {:query "SELECT AVG(SUBTOTAL) AS \"Average Price\"\nFROM ORDERS"}})

(defn- native-query-with-template-tag [field-or-id]
  {:database (data/id)
   :type     "native"
   :native   {:query         "SELECT AVG(SUBTOTAL) AS \"Average Price\"\nFROM ORDERS nWHERE {{category}}"
              :template-tags {:category {:name         "category"
                                         :display-name "Category"
                                         :type         "dimension"
                                         :dimension    ["field-id" (u/get-id field-or-id)]
                                         :widget-type  "category"
                                         :default      "Widget"}}}})

(defn- do-with-updated-fields-for-card {:style/indent 1} [options & [f]]
  (tt/with-temp* [Database [db    (:db options)]
                  Table    [table (merge {:db_id (u/get-id db)}
                                         (:table options))]
                  Field    [field (merge {:table_id (u/get-id table), :has_field_values "list"}
                                         (:field options))]]
    (do-with-mocked-field-values-updating
      (fn [updated-field-names]
        (tt/with-temp Card [card (merge {:dataset_query (native-query-with-template-tag field)}
                                        (:card options))]
          (when f
            (f {:db db, :table table, :field field, :card card, :updated-field-names updated-field-names})))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     CARDS                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- field-values-were-updated-for-new-card? [options]
  (not (empty? (do-with-updated-fields-for-card options))))

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
  (do-with-updated-fields-for-card {:db {:is_on_demand true}}
    (fn [{:keys [card updated-field-names]}]
      ;; clear out the list of updated field names
      (reset! updated-field-names #{})
      ;; now update the Card... since param didn't change at all FieldValues should not be updated
      (db/update! Card (u/get-id card) card))))

;; Existing Card with changed param referencing Field in On-Demand DB should get updated FieldValues
(expect
  #{"New Field"}
  ;; create parameterized Card with Field in On-Demand DB
  (do-with-updated-fields-for-card {:db {:is_on_demand true}}
    (fn [{:keys [table card updated-field-names]}]
      ;; clear out the list of updated field names
      (reset! updated-field-names #{})
      ;; now Change the Field that is referenced by the Card's SQL param
      (tt/with-temp Field [new-field {:table_id (u/get-id table), :has_field_values "list", :name "New Field"}]
        (db/update! Card (u/get-id card)
          :dataset_query (native-query-with-template-tag new-field))))))

;; Existing Card with newly added param referencing Field in On-Demand DB should get updated FieldValues
(expect
  #{"New Field"}
  ;; create a Card with non-parameterized query
  (do-with-updated-fields-for-card {:db    {:is_on_demand true}
                                    :card  {:dataset_query (basic-native-query)}
                                    :field {:name "New Field"}}
    (fn [{:keys [table field card]}]
      ;; now change the query to one that references our Field in a on-demand DB. Field should have updated values
      (db/update! Card (u/get-id card)
        :dataset_query (native-query-with-template-tag field)))))

;; Existing Card with unchanged param referencing Field in non-On-Demand DB should *not* get updated FieldValues
(expect
  #{}
  ;; create a parameterized Card with a Field that belongs to a non-on-demand DB
  (do-with-updated-fields-for-card {:db {:is_on_demand false}}
    (fn [{:keys [card]}]
      ;; update the Card. Field should get updated values
      (db/update! Card (u/get-id card) card))))

;; Existing Card with newly added param referencing Field in non-On-Demand DB should *not* get updated FieldValues
(expect
  #{}
  ;; create a Card with non-parameterized query
  (do-with-updated-fields-for-card {:db   {:is_on_demand false}
                                    :card {:dataset_query (basic-native-query)}}
    (fn [{:keys [field card]}]
      ;; now change the query to one that references a Field. Field should not get values since DB is not On-Demand
      (db/update! Card (u/get-id card)
        :dataset_query (native-query-with-template-tag field)))))

;; Existing Card with changed param referencing Field in non-On-Demand DB should *not* get updated FieldValues
(expect
  #{}
  ;; create a parameterized Card with a Field that belongs to a non-on-demand DB
  (do-with-updated-fields-for-card {:db {:is_on_demand false}}
    (fn [{:keys [table card]}]
      ;; change the query to one referencing a different Field. Field should not get values since DB is not On-Demand
      (tt/with-temp Field [new-field {:table_id (u/get-id table), :has_field_values "list", :name "New Field"}]
        (db/update! Card (u/get-id card)
          :dataset_query (native-query-with-template-tag new-field))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   DASHBOARDS                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- basic-mbql-query []
  {:database (data/id)
   :type     :query
   :query    {:source-table (data/id :venues)
              :aggregation  [[:count]]}})

(defn- parameter-mappings-for-card-and-field [card-or-id field-or-id]
  [{:card_id (u/get-id card-or-id)
    :target  [:dimension [:field-id (u/get-id field-or-id)]]}])

(defn- add-dashcard-with-parameter-mapping! [dashboard-or-id card-or-id field-or-id]
  (dashboard/add-dashcard! dashboard-or-id card-or-id
    {:parameter_mappings (parameter-mappings-for-card-and-field card-or-id field-or-id)}))

(defn- do-with-updated-fields-for-dashboard {:style/indent 1} [options & [f]]
  (do-with-updated-fields-for-card (merge {:card {:dataset_query (basic-mbql-query)}}
                                          options)
    (fn [objects]
      (tt/with-temp Dashboard [dash]
        (let [dashcard (add-dashcard-with-parameter-mapping! dash (:card objects) (:field objects))]
          (when f
            (f (assoc objects
                 :dash     dash
                 :dashcard dashcard))))))))

;; Existing Dashboard with newly added param referencing Field in On-Demand DB should get updated FieldValues
(expect
  #{"My Cool Field"}
  ;; Create a On-Demand DB and MBQL Card
  (do-with-updated-fields-for-dashboard {:db    {:is_on_demand true}
                                         :field {:name "My Cool Field"}}))

;; Existing Dashboard with unchanged param referencing Field in On-Demand DB should *not* get updated FieldValues
(expect
  #{}
  ;; Create a On-Demand DB and MBQL Card
  (do-with-updated-fields-for-dashboard {:db {:is_on_demand true}}
    (fn [{:keys [field card dash updated-field-names]}]
      ;; clear out the list of updated Field Names
      (reset! updated-field-names #{})
      ;; ok, now add a new Card with a param that references the same field
      ;; The field shouldn't get new values because the set of referenced Fields didn't change
      (add-dashcard-with-parameter-mapping! dash card field))))

;; Existing Dashboard with changed referencing Field in On-Demand DB should get updated FieldValues
(expect
  #{"New Field"}
  ;; Create a On-Demand DB and MBQL Card
  (do-with-updated-fields-for-dashboard {:db {:is_on_demand true}}
    (fn [{:keys [table field card dash dashcard updated-field-names]}]
      ;; create a Dashboard and add a DashboardCard with a param mapping
      (tt/with-temp Field [new-field {:table_id         (u/get-id table)
                                      :name             "New Field"
                                      :has_field_values "list"}]
        ;; clear out the list of updated Field Names
        (reset! updated-field-names #{})
        ;; ok, now update the parameter mapping to the new field. The new Field should get new values
        (dashboard/update-dashcards! dash
          [(assoc dashcard :parameter_mappings (parameter-mappings-for-card-and-field card new-field))])))))

;; Existing Dashboard with newly added param referencing Field in non-On-Demand DB should *not* get updated FieldValues
(expect
  #{}
  (do-with-updated-fields-for-dashboard {:db {:is_on_demand false}}))

;; Existing Dashboard with unchanged param referencing Field in non-On-Demand DB should *not* get updated FieldValues
(expect
  #{}
  (do-with-updated-fields-for-dashboard {:db {:is_on_demand false}}
    (fn [{:keys [field card dash updated-field-names]}]
      (add-dashcard-with-parameter-mapping! dash card field))))

;; Existing Dashboard with changed param referencing Field in non-On-Demand DB should *not* get updated FieldValues
(expect
  #{}
  (do-with-updated-fields-for-dashboard {:db {:is_on_demand false}}
    (fn [{:keys [table field card dash dashcard updated-field-names]}]
      (tt/with-temp Field [new-field {:table_id (u/get-id table), :has_field_values "list"}]
        (dashboard/update-dashcards! dash
          [(assoc dashcard :parameter_mappings (parameter-mappings-for-card-and-field card new-field))])))))
