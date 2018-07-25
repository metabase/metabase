(ns metabase.automagic-dashboards.core-test
  (:require [clj-time
             [core :as t]
             [format :as t.format]]
            [expectations :refer :all]
            [metabase.api.common :as api]
            [metabase.automagic-dashboards
             [core :refer :all :as magic]
             [rules :as rules]]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [database :refer [Database]]
             [field :as field :refer [Field]]
             [metric :refer [Metric]]
             [permissions :as perms]
             [permissions-group :as perms-group]
             [query :as query]
             [table :refer [Table] :as table]]
            [metabase.test.data :as data]
            [metabase.test.automagic-dashboards :refer :all]
            [metabase.util.date :as date]
            [puppetlabs.i18n.core :as i18n :refer [tru]]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

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

(defn- test-automagic-analysis
  ([entity] (test-automagic-analysis entity nil))
  ([entity cell-query]
   ;; We want to both generate as many cards as we can to catch all aberrations, but also make sure
   ;; that size limiting works.
   (and (valid-dashboard? (automagic-analysis entity {:cell-query cell-query :show :all}))
        (valid-dashboard? (automagic-analysis entity {:cell-query cell-query :show 1})))))

(expect
  (with-rasta
    (with-dashboard-cleanup
      (->> (db/select Table :db_id (data/id))
           (every? test-automagic-analysis)))))

(expect
  (with-rasta
    (with-dashboard-cleanup
      (->> (automagic-analysis (Table (data/id :venues)) {:show 1})
           :ordered_cards
           (filter :card)
           count
           (= 1)))))

(expect
  (with-rasta
    (with-dashboard-cleanup
      (->> (db/select Field
             :table_id [:in (db/select-field :id Table :db_id (data/id))]
             :visibility_type "normal")
           (every? test-automagic-analysis)))))

(expect
  (tt/with-temp* [Metric [{metric-id :id} {:table_id (data/id :venues)
                                           :definition {:query {:aggregation ["count"]}}}]]
    (with-rasta
      (with-dashboard-cleanup
        (->> (Metric) (every? test-automagic-analysis))))))

(expect
  (tt/with-temp* [Collection [{collection-id :id}]
                  Card [{card-id :id} {:table_id      (data/id :venues)
                                       :collection_id collection-id
                                       :dataset_query {:query {:filter [:> [:field-id (data/id :venues :price)] 10]
                                                               :source_table (data/id :venues)}
                                                       :type :query
                                                       :database (data/id)}}]]
    (with-rasta
      (with-dashboard-cleanup
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
        (-> card-id Card test-automagic-analysis)))))

(expect
  (tt/with-temp* [Collection [{collection-id :id}]
                  Card [{card-id :id} {:table_id      (data/id :venues)
                                       :collection_id collection-id
                                       :dataset_query {:query {:aggregation [[:count]]
                                                               :breakout [[:field-id (data/id :venues :category_id)]]
                                                               :source_table (data/id :venues)}
                                                       :type :query
                                                       :database (data/id)}}]]
    (with-rasta
      (with-dashboard-cleanup
        (-> card-id Card test-automagic-analysis)))))

(expect
  (tt/with-temp* [Collection [{collection-id :id}]
                  Card [{card-id :id} {:table_id      nil
                                       :collection_id collection-id
                                       :dataset_query {:native {:query "select * from users"}
                                                       :type :native
                                                       :database (data/id)}}]]
    (with-rasta
      (with-dashboard-cleanup
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
        (-> card-id Card test-automagic-analysis)))))

(expect
  (tt/with-temp* [Collection [{collection-id :id}]
                  Card [{source-id :id} {:table_id      (data/id :venues)
                                         :collection_id collection-id
                                         :dataset_query {:query    {:source_table (data/id :venues)}
                                                         :type     :query
                                                         :database (data/id)}}]
                  Card [{card-id :id} {:table_id      (data/id :venues)
                                       :collection_id collection-id
                                       :dataset_query {:query    {:filter       [:> [:field-id (data/id :venues :price)] 10]
                                                                  :source_table (str "card__" source-id)}
                                                       :type     :query
                                                       :database -1337}}]]
    (with-rasta
      (with-dashboard-cleanup
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
        (-> card-id Card test-automagic-analysis)))))

(expect
  (tt/with-temp* [Collection [{collection-id :id}]
                  Card [{source-id :id} {:table_id      nil
                                         :collection_id collection-id
                                         :dataset_query {:native {:query "select * from users"}
                                                         :type :native
                                                         :database (data/id)}}]
                  Card [{card-id :id} {:table_id      (data/id :venues)
                                       :collection_id collection-id
                                       :dataset_query {:query    {:filter       [:> [:field-id (data/id :venues :price)] 10]
                                                                  :source_table (str "card__" source-id)}
                                                       :type     :query
                                                       :database -1337}}]]
    (with-rasta
      (with-dashboard-cleanup
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
        (-> card-id Card test-automagic-analysis)))))

(expect
  (tt/with-temp* [Collection [{collection-id :id}]
                  Card [{card-id :id} {:table_id      nil
                                       :collection_id collection-id
                                       :dataset_query {:native {:query "select * from users"}
                                                       :type :native
                                                       :database (data/id)}}]]
    (with-rasta
      (with-dashboard-cleanup
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
        (-> card-id Card test-automagic-analysis)))))

(expect
  (tt/with-temp* [Collection [{collection-id :id}]
                  Card [{card-id :id} {:table_id      (data/id :venues)
                                       :collection_id collection-id
                                       :dataset_query {:query {:filter [:> [:field-id (data/id :venues :price)] 10]
                                                               :source_table (data/id :venues)}
                                                       :type :query
                                                       :database (data/id)}}]]
    (with-rasta
      (with-dashboard-cleanup
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
        (-> card-id
            Card
            (test-automagic-analysis [:= [:field-id (data/id :venues :category_id)] 2]))))))


(expect
  (tt/with-temp* [Collection [{collection-id :id}]
                  Card [{card-id :id} {:table_id      (data/id :venues)
                                       :collection_id collection-id
                                       :dataset_query {:query {:filter [:> [:field-id (data/id :venues :price)] 10]
                                                               :source_table (data/id :venues)}
                                                       :type :query
                                                       :database (data/id)}}]]
    (with-rasta
      (with-dashboard-cleanup
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
        (-> card-id
            Card
            (test-automagic-analysis [:= [:field-id (data/id :venues :category_id)] 2]))))))


(expect
  (with-rasta
    (with-dashboard-cleanup
      (let [q (query/adhoc-query {:query {:filter [:> [:field-id (data/id :venues :price)] 10]
                                          :source_table (data/id :venues)}
                                  :type :query
                                  :database (data/id)})]
        (test-automagic-analysis q)))))

(expect
  (with-rasta
    (with-dashboard-cleanup
      (let [q (query/adhoc-query {:query {:aggregation [[:count]]
                                          :breakout [[:field-id (data/id :venues :category_id)]]
                                          :source_table (data/id :venues)}
                                  :type :query
                                  :database (data/id)})]
        (test-automagic-analysis q)))))

(expect
  (with-rasta
    (with-dashboard-cleanup
      (let [q (query/adhoc-query {:query {:aggregation [[:count]]
                                          :breakout [[:fk-> (data/id :checkins) (data/id :venues :category_id)]]
                                          :source_table (data/id :checkins)}
                                  :type :query
                                  :database (data/id)})]
        (test-automagic-analysis q)))))

(expect
  (with-rasta
    (with-dashboard-cleanup
      (let [q (query/adhoc-query {:query {:filter [:> [:field-id (data/id :venues :price)] 10]
                                          :source_table (data/id :venues)}
                                  :type :query
                                  :database (data/id)})]
        (test-automagic-analysis q [:= [:field-id (data/id :venues :category_id)] 2])))))


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


;;; ------------------- Datetime humanization (for chart and dashboard titles) -------------------

(let [tz                     (-> date/jvm-timezone deref ^TimeZone .getID)
      dt                     (t/from-time-zone (t/date-time 1990 9 9 12 30)
                                               (t/time-zone-for-id tz))
      unparse-with-formatter (fn [formatter dt]
                                 (t.format/unparse
                                  (t.format/formatter formatter (t/time-zone-for-id tz)) dt))]
  (expect
    [(tru "at {0}" (unparse-with-formatter "h:mm a, MMMM d, YYYY" dt))
     (tru "at {0}" (unparse-with-formatter "h a, MMMM d, YYYY" dt))
     (tru "on {0}" (unparse-with-formatter "MMMM d, YYYY" dt))
     (tru "in {0} week - {1}"
          (#'magic/pluralize (date/date-extract :week-of-year dt tz))
          (str (date/date-extract :year dt tz)))
     (tru "in {0}" (unparse-with-formatter "MMMM YYYY" dt))
     (tru "in Q{0} - {1}"
          (date/date-extract :quarter-of-year dt tz)
          (str (date/date-extract :year dt tz)))
     (unparse-with-formatter "YYYY" dt)
     (unparse-with-formatter "EEEE" dt)
     (tru "at {0}" (unparse-with-formatter "h a" dt))
     (unparse-with-formatter "MMMM" dt)
     (tru "Q{0}" (date/date-extract :quarter-of-year dt tz))
     (date/date-extract :minute-of-hour dt tz)
     (date/date-extract :day-of-month dt tz)
     (date/date-extract :week-of-year dt tz)]
    (let [dt (t.format/unparse (t.format/formatters :date-hour-minute-second) dt)]
      [(#'magic/humanize-datetime dt :minute)
       (#'magic/humanize-datetime dt :hour)
       (#'magic/humanize-datetime dt :day)
       (#'magic/humanize-datetime dt :week)
       (#'magic/humanize-datetime dt :month)
       (#'magic/humanize-datetime dt :quarter)
       (#'magic/humanize-datetime dt :year)
       (#'magic/humanize-datetime dt :day-of-week)
       (#'magic/humanize-datetime dt :hour-of-day)
       (#'magic/humanize-datetime dt :month-of-year)
       (#'magic/humanize-datetime dt :quarter-of-year)
       (#'magic/humanize-datetime dt :minute-of-hour)
       (#'magic/humanize-datetime dt :day-of-month)
       (#'magic/humanize-datetime dt :week-of-year)])))

(expect
  [(tru "{0}st" 1)
   (tru "{0}nd" 22)
   (tru "{0}rd" 303)
   (tru "{0}th" 0)
   (tru "{0}th" 8)]
  (map #'magic/pluralize [1 22 303 0 8]))

;; Make sure we have handlers for all the units available
(expect
  (every? (partial #'magic/humanize-datetime "1990-09-09T12:30:00")
          (concat (var-get #'date/date-extract-units) (var-get #'date/date-trunc-units))))
