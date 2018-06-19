(ns metabase.automagic-dashboards.core-test
  (:require [expectations :refer :all]
            [metabase.api.common :as api]
            [metabase.automagic-dashboards
             [core :refer :all :as magic]
             [rules :as rules]]
            [metabase.models
             [card :refer [Card]]
             [database :refer [Database]]
             [field :as field :refer [Field]]
             [metric :refer [Metric]]
             [query :as query]
             [table :refer [Table] :as table]
             [user :as user]]
            [metabase.query-processor :as qp]
            [metabase.test.data :as data]
            [metabase.test.data.users :as test-users]
            [metabase.test.util :as tu]
            [toucan.db :as db]
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

(defmacro ^:private with-dashboard-cleanup
  [& body]
  `(tu/with-model-cleanup ['~'Card '~'Dashboard '~'Collection '~'DashboardCard]
     ~@body))


;;; ------------------- `->reference` -------------------

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


;;; ------------------- Rule matching  -------------------

(expect
  [:entity/UserTable :entity/GenericTable :entity/*]
  (->> (data/id :users)
       Table
       (#'magic/->root)
       (#'magic/matching-rules (rules/get-rules ["table"]))
       (map (comp first :applies_to))))

;; Test fallback to GenericTable
(expect
  [:entity/GenericTable :entity/*]
  (->> (-> (data/id :users)
           Table
           (assoc :entity_type nil)
           (#'magic/->root))
       (#'magic/matching-rules (rules/get-rules ["table"]))
       (map (comp first :applies_to))))


;;; ------------------- `automagic-anaysis` -------------------

(defn- collect-urls
  [dashboard]
  (->> dashboard
       (tree-seq (some-fn sequential? map?) identity)
       (keep (fn [form]
               (when (map? form)
                 (:url form))))))

(defn- valid-urls?
  [dashboard]
  (->> dashboard
       collect-urls
       (every? (fn [url]
                 ((test-users/user->client :rasta) :get 200 (format "automagic-dashboards/%s"
                                                                    (subs url 16)))))))

(def ^:private valid-card?
  (comp qp/expand :dataset_query))

(defn- valid-dashboard?
  [dashboard]
  (assert (:name dashboard))
  (assert (-> dashboard :ordered_cards count pos?))
  (assert (valid-urls? dashboard))
  (assert (every? valid-card? (keep :card (:ordered_cards dashboard))))
  true)

(expect
  (with-rasta
    (with-dashboard-cleanup
      (->> (db/select Table :db_id (data/id))
           (keep #(automagic-analysis % {}))
           (every? valid-dashboard?)))))

(expect
  (with-rasta
    (with-dashboard-cleanup
      (->> (db/select Field
             :table_id [:in (db/select-field :id Table :db_id (data/id))]
             :visibility_type "normal")
           (keep #(automagic-analysis % {}))
           (every? valid-dashboard?)))))

(expect
  (tt/with-temp* [Metric [{metric-id :id} {:table_id (data/id :venues)
                                           :definition {:query {:aggregation ["count"]}}}]]
    (with-rasta
      (with-dashboard-cleanup
        (->> (Metric) (keep #(automagic-analysis % {})) (every? valid-dashboard?))))))

(expect
  (tt/with-temp* [Card [{card-id :id} {:table_id      (data/id :venues)
                                       :dataset_query {:query {:filter [:> [:field-id (data/id :venues :price)] 10]
                                                               :source_table (data/id :venues)}
                                                       :type :query
                                                       :database (data/id)}}]]
    (with-rasta
      (with-dashboard-cleanup
        (-> card-id Card (automagic-analysis {}) valid-dashboard?)))))

(expect
  (tt/with-temp* [Card [{card-id :id} {:table_id      (data/id :venues)
                                       :dataset_query {:query {:aggregation [[:count]]
                                                               :breakout [[:field-id (data/id :venues :category_id)]]
                                                               :source_table (data/id :venues)}
                                                       :type :query
                                                       :database (data/id)}}]]
    (with-rasta
      (with-dashboard-cleanup
        (-> card-id Card (automagic-analysis {}) valid-dashboard?)))))

(expect
  (tt/with-temp* [Card [{card-id :id} {:table_id      nil
                                       :dataset_query {:native {:query "select * from users"}
                                                       :type :native
                                                       :database (data/id)}}]]
    (with-rasta
      (with-dashboard-cleanup
        (-> card-id Card (automagic-analysis {}) valid-dashboard?)))))

(expect
  (tt/with-temp* [Card [{source-id :id} {:table_id      (data/id :venues)
                                         :dataset_query {:query    {:source_table (data/id :venues)}
                                                         :type     :query
                                                         :database (data/id)}}]
                  Card [{card-id :id} {:table_id      (data/id :venues)
                                       :dataset_query {:query    {:filter       [:> [:field-id (data/id :venues :price)] 10]
                                                                  :source_table (str "card__" source-id)}
                                                       :type     :query
                                                       :database -1337}}]]
    (with-rasta
      (with-dashboard-cleanup
        (-> card-id Card (automagic-analysis {}) valid-dashboard?)))))

(expect
  (tt/with-temp* [Card [{source-id :id} {:table_id      nil
                                         :dataset_query {:native {:query "select * from users"}
                                                         :type :native
                                                         :database (data/id)}}]
                  Card [{card-id :id} {:table_id      (data/id :venues)
                                       :dataset_query {:query    {:filter       [:> [:field-id (data/id :venues :price)] 10]
                                                                  :source_table (str "card__" source-id)}
                                                       :type     :query
                                                       :database -1337}}]]
    (with-rasta
      (with-dashboard-cleanup
        (-> card-id Card (automagic-analysis {}) valid-dashboard?)))))

(expect
  (tt/with-temp* [Card [{card-id :id} {:table_id      nil
                                       :dataset_query {:native {:query "select * from users"}
                                                       :type :native
                                                       :database (data/id)}}]]
    (with-rasta
      (with-dashboard-cleanup
        (-> card-id Card (automagic-analysis {}) valid-dashboard?)))))

(expect
  (tt/with-temp* [Card [{card-id :id} {:table_id      (data/id :venues)
                                       :dataset_query {:query {:filter [:> [:field-id (data/id :venues :price)] 10]
                                                               :source_table (data/id :venues)}
                                                       :type :query
                                                       :database (data/id)}}]]
    (with-rasta
      (with-dashboard-cleanup
        (-> card-id
            Card
            (automagic-analysis {:cell-query [:= [:field-id (data/id :venues :category_id)] 2]})
            valid-dashboard?)))))


(expect
  (tt/with-temp* [Card [{card-id :id} {:table_id      (data/id :venues)
                                       :dataset_query {:query {:filter [:> [:field-id (data/id :venues :price)] 10]
                                                               :source_table (data/id :venues)}
                                                       :type :query
                                                       :database (data/id)}}]]
    (with-rasta
      (with-dashboard-cleanup
        (-> card-id
            Card
            (automagic-analysis {:cell-query [:!= [:field-id (data/id :venues :category_id)] 2]})
            valid-dashboard?)))))


(expect
  (with-rasta
    (with-dashboard-cleanup
      (let [q (query/adhoc-query {:query {:filter [:> [:field-id (data/id :venues :price)] 10]
                                          :source_table (data/id :venues)}
                                  :type :query
                                  :database (data/id)})]
        (-> q (automagic-analysis {}) valid-dashboard?)))))

(expect
  (with-rasta
    (with-dashboard-cleanup
      (let [q (query/adhoc-query {:query {:aggregation [[:count]]
                                          :breakout [[:field-id (data/id :venues :category_id)]]
                                          :source_table (data/id :venues)}
                                  :type :query
                                  :database (data/id)})]
        (-> q (automagic-analysis {}) valid-dashboard?)))))

(expect
  (with-rasta
    (with-dashboard-cleanup
      (let [q (query/adhoc-query {:query {:aggregation [[:count]]
                                          :breakout [[:fk-> (data/id :checkins) (data/id :venues :category_id)]]
                                          :source_table (data/id :checkins)}
                                  :type :query
                                  :database (data/id)})]
        (-> q (automagic-analysis {}) valid-dashboard?)))))

(expect
  (with-rasta
    (with-dashboard-cleanup
      (let [q (query/adhoc-query {:query {:filter [:> [:field-id (data/id :venues :price)] 10]
                                          :source_table (data/id :venues)}
                                  :type :query
                                  :database (data/id)})]
        (-> q
            (automagic-analysis {:cell-query [:= [:field-id (data/id :venues :category_id)] 2]})
            valid-dashboard?)))))


;;; ------------------- /candidates -------------------

(expect
  3
  (with-rasta
    (->> (Database (data/id)) candidate-tables first :tables count)))

;; /candidates should work with unanalyzed tables
(expect
  1
  (tt/with-temp* [Database [{db-id :id}]
                  Table    [{table-id :id} {:db_id db-id}]
                  Field    [_ {:table_id table-id}]
                  Field    [_ {:table_id table-id}]]
    (with-rasta
      (with-dashboard-cleanup
        (count (candidate-tables (Database db-id)))))))

(expect
  4
  (tt/with-temp* [Database [{db-id :id}]
                  Table    [{table-id :id} {:db_id db-id}]
                  Field    [_ {:table_id table-id}]
                  Field    [_ {:table_id table-id}]]
    (with-rasta
      (with-dashboard-cleanup
        (let [database (Database db-id)]
          (db/with-call-counting [call-count]
            (candidate-tables database)
            (call-count)))))))

(expect
  {:list-like?  true
   :link-table? false
   :num-fields 2}
  (tt/with-temp* [Database [{db-id :id}]
                  Table    [{table-id :id} {:db_id db-id}]
                  Field    [_ {:table_id table-id :special_type :type/PK}]
                  Field    [_ {:table_id table-id}]]
    (with-rasta
      (with-dashboard-cleanup
        (-> (#'magic/enhance-table-stats [(Table table-id)])
            first
            :stats)))))

(expect
  {:list-like?  false
   :link-table? true
   :num-fields 3}
  (tt/with-temp* [Database [{db-id :id}]
                  Table    [{table-id :id} {:db_id db-id}]
                  Field    [_ {:table_id table-id :special_type :type/PK}]
                  Field    [_ {:table_id table-id :special_type :type/FK}]
                  Field    [_ {:table_id table-id :special_type :type/FK}]]
    (with-rasta
      (with-dashboard-cleanup
        (-> (#'magic/enhance-table-stats [(Table table-id)])
            first
            :stats)))))


;;; ------------------- Definition overloading -------------------

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


;;; ------------------- Datetime resolution inference -------------------

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
