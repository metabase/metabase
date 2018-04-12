(ns metabase.automagic-dashboards.core-test
  (:require [expectations :refer :all]
            [metabase.api.common :as api]
            [metabase.automagic-dashboards
             [core :refer :all :as magic]
             [rules :as rules]]
            [metabase.models
             [database :refer [Database]]
             [field :as field :refer [Field]]
             [metric :refer [Metric]]
             [table :refer [Table] :as table]
             [user :as user]]
            [metabase.test.data :as data]
            [metabase.test.data.users :as test-users]
            [metabase.test.util :as tu]
            [toucan.util.test :as tt]))

(defmacro with-rasta
  "Execute body with rasta as the current user."
  [& body]
  `(binding [api/*current-user-id*              (test-users/user->id :rasta)
             api/*current-user-permissions-set* (-> :rasta
                                                    test-users/user->id
                                                    user/permissions-set
                                                    atom)]
     ~@body))


(expect
  [:field-id 1]
  (->> (assoc (field/->FieldInstance) :id 1)
       (#'magic/->reference :mbql)))

(expect
  [:fk-> 1 2]
  (->> (assoc (field/->FieldInstance) :id 1 :fk_target_field_id 2)
       (#'magic/->reference :mbql)))

(expect
  42
  (->> 42
       (#'magic/->reference :mbql)))


(expect
  [:entity/UserTable :entity/GenericTable :entity/*]
  (let [table (table/map->TableInstance {:entity_type :entity/UserTable})]
    (->> {:entity       table
          :source-table table}
         (#'magic/matching-rules (rules/load-rules "table"))
         (map (comp first :applies_to)))))


(expect
  false
  (with-rasta
    (tu/with-model-cleanup ['Card 'Dashboard 'Collection 'DashboardCard]
      (->> (Table) (keep #(automagic-analysis % {})) empty?))))

(expect
  false
  (with-rasta
    (tu/with-model-cleanup ['Card 'Dashboard 'Collection 'DashboardCard]
      (->> (Field) (keep #(automagic-analysis % {})) empty?))))

(expect
  false
  (tt/with-temp* [Metric [{metric-id :id} {:table_id (data/id :venues)
                                           :definition {:query {:aggregation ["count"]}}}]]
    (with-rasta
      (tu/with-model-cleanup ['Card 'Dashboard 'Collection 'DashboardCard]
        (->> (Metric) (keep #(automagic-analysis % {})) empty?)))))


(expect
  4
  (->> (Database (data/id)) candidate-tables count))


;; Identity
(expect
  :d1
  (-> [{:d1 {:field_type [:type/Category] :score 100}}]
      (#'magic/most-specific-definition)
      first
      key))

;; Base case: more ancestors
(expect
  :d2
  (-> [{:d1 {:field_type [:type/Category] :score 100}}
       {:d2 {:field_type [:type/State] :score 100}}]
      (#'magic/most-specific-definition)
      first
      key))

;; Break ties based on the number of additional filters
(expect
  :d3
  (-> [{:d1 {:field_type [:type/Category] :score 100}}
       {:d2 {:field_type [:type/State] :score 100}}
       {:d3 {:field_type [:type/State]
             :named      "foo"
             :score      100}}]
      (#'magic/most-specific-definition)
      first
      key))

;; Break ties on score
(expect
  :d2
  (-> [{:d1 {:field_type [:type/Category] :score 100}}
       {:d2 {:field_type [:type/State] :score 100}}
       {:d3 {:field_type [:type/State] :score 90}}]
      (#'magic/most-specific-definition)
      first
      key))

;; Number of additional filters has precedence over score
(expect
  :d3
  (-> [{:d1 {:field_type [:type/Category] :score 100}}
       {:d2 {:field_type [:type/State] :score 100}}
       {:d3 {:field_type [:type/State]
             :named      "foo"
             :score      0}}]
      (#'magic/most-specific-definition)
      first
      key))


(expect
  :month
  (#'magic/optimal-datetime-resolution
   {:fingerprint {:type {:type/DateTime {:earliest "2015"
                                         :latest   "2017"}}}}))

(expect
  :day
  (#'magic/optimal-datetime-resolution
   {:fingerprint {:type {:type/DateTime {:earliest "2017-01-01"
                                         :latest   "2017-03-04"}}}}))

(expect
  :year
  (#'magic/optimal-datetime-resolution
   {:fingerprint {:type {:type/DateTime {:earliest "2005"
                                         :latest   "2017"}}}}))

(expect
  :hour
  (#'magic/optimal-datetime-resolution
   {:fingerprint {:type {:type/DateTime {:earliest "2017-01-01"
                                         :latest   "2017-01-02"}}}}))

(expect
  :minute
  (#'magic/optimal-datetime-resolution
   {:fingerprint {:type {:type/DateTime {:earliest "2017-01-01T00:00:00"
                                         :latest   "2017-01-01T00:02:00"}}}}))
