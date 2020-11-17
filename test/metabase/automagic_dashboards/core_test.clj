(ns metabase.automagic-dashboards.core-test
  (:require [clojure.core.async :as a]
            [clojure.test :refer :all]
            [expectations :refer [expect]]
            [java-time :as t]
            [metabase
             [models :refer [Card Collection Database Field Metric Table]]
             [test :as mt]]
            [metabase.api.common :as api]
            [metabase.automagic-dashboards
             [core :as magic :refer :all]
             [rules :as rules]]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models
             [field :as field]
             [permissions :as perms]
             [permissions-group :as perms-group]
             [query :as query]]
            [metabase.query-processor.async :as qp.async]
            [metabase.test
             [automagic-dashboards :refer :all]
             [util :as tu]]
            [metabase.util
             [date-2 :as u.date]
             [i18n :refer [tru]]]
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
  (->> (mt/id :users)
       Table
       (#'magic/->root)
       (#'magic/matching-rules (rules/get-rules ["table"]))
       (map (comp first :applies_to))))

;; Test fallback to GenericTable
(expect
  [:entity/GenericTable :entity/*]
  (->> (-> (mt/id :users)
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
  (mt/with-test-user :rasta
    (with-dashboard-cleanup
      (->> (db/select Table :db_id (mt/id))
           (every? test-automagic-analysis)))))

(expect
  (mt/with-test-user :rasta
    (with-dashboard-cleanup
      (->> (automagic-analysis (Table (mt/id :venues)) {:show 1})
           :ordered_cards
           (filter :card)
           count
           (= 1)))))

(deftest wierd-characters-in-names-test
  (mt/with-log-level :info
    (mt/with-test-user :rasta
      (with-dashboard-cleanup
        (-> (Table (mt/id :venues))
            (assoc :display_name "%Venues")
            test-automagic-analysis)))))

(expect
  (mt/with-test-user :rasta
    (with-dashboard-cleanup
      (->> (db/select Field
             :table_id [:in (db/select-field :id Table :db_id (mt/id))]
             :visibility_type "normal")
           (every? test-automagic-analysis)))))

(expect
  (tt/with-temp* [Metric [metric {:table_id (mt/id :venues)
                                  :definition {:aggregation [[:count]]}}]]
    (mt/with-test-user :rasta
      (with-dashboard-cleanup
        (test-automagic-analysis metric)))))

(expect
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [{collection-id :id}]
                    Card [{card-id :id} {:table_id      (mt/id :venues)
                                         :collection_id collection-id
                                         :dataset_query {:query {:filter [:> [:field-id (mt/id :venues :price)] 10]
                                                                 :source-table (mt/id :venues)}
                                                         :type :query
                                                         :database (mt/id)}}]]
      (mt/with-test-user :rasta
        (with-dashboard-cleanup
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
          (-> card-id Card test-automagic-analysis))))))

(expect
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [{collection-id :id}]
                    Card [{card-id :id} {:table_id      (mt/id :venues)
                                         :collection_id collection-id
                                         :dataset_query {:query {:aggregation [[:count]]
                                                                 :breakout [[:field-id (mt/id :venues :category_id)]]
                                                                 :source-table (mt/id :venues)}
                                                         :type :query
                                                         :database (mt/id)}}]]
      (mt/with-test-user :rasta
        (with-dashboard-cleanup
          (-> card-id Card test-automagic-analysis))))))

(expect
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [{collection-id :id}]
                    Card [{card-id :id} {:table_id      nil
                                         :collection_id collection-id
                                         :dataset_query {:native {:query "select * from users"}
                                                         :type :native
                                                         :database (mt/id)}}]]
      (mt/with-test-user :rasta
        (with-dashboard-cleanup
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
          (-> card-id Card test-automagic-analysis))))))

(defn- result-metadata-for-query [query]
  (first
   (a/alts!!
    [(qp.async/result-metadata-for-query-async query)
     (a/timeout 1000)])))

(expect
  (tu/with-non-admin-groups-no-root-collection-perms
    (let [source-query {:query    {:source-table (mt/id :venues)}
                        :type     :query
                        :database (mt/id)}]
      (tt/with-temp* [Collection [{collection-id :id}]
                      Card [{source-id :id} {:table_id      (mt/id :venues)
                                             :collection_id   collection-id
                                             :dataset_query   source-query
                                             :result_metadata (mt/with-test-user :rasta (result-metadata-for-query source-query))}]
                      Card [{card-id :id} {:table_id      (mt/id :venues)
                                           :collection_id collection-id
                                           :dataset_query {:query    {:filter       [:> [:field-literal "PRICE" "type/Number"] 10]
                                                                      :source-table (str "card__" source-id)}
                                                           :type     :query
                                                           :database mbql.s/saved-questions-virtual-database-id}}]]
        (mt/with-test-user :rasta
          (with-dashboard-cleanup
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
            (-> card-id Card test-automagic-analysis)))))))

(expect
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [{collection-id :id}]
                    Card [{card-id :id} {:table_id      (mt/id :venues)
                                         :collection_id collection-id
                                         :dataset_query {:query    {:filter       [:> [:field-id (mt/id :venues :price)] 10]
                                                                    :source-table (mt/id :venues)}
                                                         :type     :query
                                                         :database (mt/id)}}]]
      (mt/with-test-user :rasta
        (with-dashboard-cleanup
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
          (-> card-id Card test-automagic-analysis))))))

(expect
  (tu/with-non-admin-groups-no-root-collection-perms
    (let [source-query {:native   {:query "select * from venues"}
                        :type     :native
                        :database (mt/id)}]
      (tt/with-temp* [Collection [{collection-id :id}]
                      Card [{source-id :id} {:table_id        nil
                                             :collection_id   collection-id
                                             :dataset_query   source-query
                                             :result_metadata (mt/with-test-user :rasta (result-metadata-for-query source-query))}]
                      Card [{card-id :id} {:table_id      nil
                                           :collection_id collection-id
                                           :dataset_query {:query    {:filter       [:> [:field-literal "PRICE" "type/Number"] 10]
                                                                      :source-table (str "card__" source-id)}
                                                           :type     :query
                                                           :database mbql.s/saved-questions-virtual-database-id}}]]
        (mt/with-test-user :rasta
          (with-dashboard-cleanup
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
            (-> card-id Card test-automagic-analysis)))))))

(expect
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [{collection-id :id}]
                    Card [{card-id :id} {:table_id      (mt/id :venues)
                                         :collection_id collection-id
                                         :dataset_query {:query    {:aggregation  [[:count]]
                                                                    :breakout     [[:field-id (mt/id :venues :category_id)]]
                                                                    :source-table (mt/id :venues)}
                                                         :type     :query
                                                         :database (mt/id)}}]]
      (mt/with-test-user :rasta
        (with-dashboard-cleanup
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
          (-> card-id Card test-automagic-analysis))))))

(expect
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [{collection-id :id}]
                    Card [{card-id :id} {:table_id      nil
                                         :collection_id collection-id
                                         :dataset_query {:native   {:query "select * from users"}
                                                         :type     :native
                                                         :database (mt/id)}}]]
      (mt/with-test-user :rasta
        (with-dashboard-cleanup
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
          (-> card-id Card test-automagic-analysis))))))

(expect
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [{collection-id :id}]
                    Card [{card-id :id} {:table_id      nil
                                         :collection_id collection-id
                                         :dataset_query {:native   {:query "select * from users"}
                                                         :type     :native
                                                         :database (mt/id)}}]]
      (mt/with-test-user :rasta
        (with-dashboard-cleanup
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
          (-> card-id Card test-automagic-analysis))))))

(expect
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [{collection-id :id}]
                    Card [{card-id :id} {:table_id      (mt/id :venues)
                                         :collection_id collection-id
                                         :dataset_query {:query    {:filter       [:> [:field-id (mt/id :venues :price)] 10]
                                                                    :source-table (mt/id :venues)}
                                                         :type     :query
                                                         :database (mt/id)}}]]
      (mt/with-test-user :rasta
        (with-dashboard-cleanup
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
          (-> card-id
              Card
              (test-automagic-analysis [:= [:field-id (mt/id :venues :category_id)] 2])))))))


(expect
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [{collection-id :id}]
                    Card [{card-id :id} {:table_id      (mt/id :venues)
                                         :collection_id collection-id
                                         :dataset_query {:query    {:filter       [:> [:field-id (mt/id :venues :price)] 10]
                                                                    :source-table (mt/id :venues)}
                                                         :type     :query
                                                         :database (mt/id)}}]]
      (mt/with-test-user :rasta
        (with-dashboard-cleanup
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
          (-> card-id
              Card
              (test-automagic-analysis [:= [:field-id (mt/id :venues :category_id)] 2])))))))


(expect
  (mt/with-test-user :rasta
    (with-dashboard-cleanup
      (let [q (query/adhoc-query {:query {:filter [:> [:field-id (mt/id :venues :price)] 10]
                                          :source-table (mt/id :venues)}
                                  :type :query
                                  :database (mt/id)})]
        (test-automagic-analysis q)))))

(expect
  (mt/with-test-user :rasta
    (with-dashboard-cleanup
      (let [q (query/adhoc-query {:query {:aggregation [[:count]]
                                          :breakout [[:field-id (mt/id :venues :category_id)]]
                                          :source-table (mt/id :venues)}
                                  :type :query
                                  :database (mt/id)})]
        (test-automagic-analysis q)))))

(expect
  (mt/with-test-user :rasta
    (with-dashboard-cleanup
      (let [q (query/adhoc-query {:query {:aggregation [[:count]]
                                          :breakout [[:fk-> (mt/id :checkins) (mt/id :venues :category_id)]]
                                          :source-table (mt/id :checkins)}
                                  :type :query
                                  :database (mt/id)})]
        (test-automagic-analysis q)))))

(expect
  (mt/with-test-user :rasta
    (with-dashboard-cleanup
      (let [q (query/adhoc-query {:query {:filter [:> [:field-id (mt/id :venues :price)] 10]
                                          :source-table (mt/id :venues)}
                                  :type :query
                                  :database (mt/id)})]
        (test-automagic-analysis q [:= [:field-id (mt/id :venues :category_id)] 2])))))


;;; ------------------- /candidates -------------------

(expect
  4
  (mt/with-test-user :rasta
    (->> (mt/db) candidate-tables first :tables count)))

;; /candidates should work with unanalyzed tables
(expect
  1
  (tt/with-temp* [Database [{db-id :id}]
                  Table    [{table-id :id} {:db_id db-id}]
                  Field    [_ {:table_id table-id}]
                  Field    [_ {:table_id table-id}]]
    (mt/with-test-user :rasta
      (with-dashboard-cleanup
        (count (candidate-tables (Database db-id)))))))

(deftest call-count-test
  (tt/with-temp* [Database [{db-id :id}]
                  Table    [{table-id :id} {:db_id db-id}]
                  Field    [_ {:table_id table-id}]
                  Field    [_ {:table_id table-id}]]
    (mt/with-test-user :rasta
      ;; make sure the current user permissions set is already fetched so it's not included in the DB call count below
      @api/*current-user-permissions-set*
      (with-dashboard-cleanup
        (let [database (Database db-id)]
          (db/with-call-counting [call-count]
            (candidate-tables database)
            (is (= 4
                   (call-count)))))))))

(deftest empty-table-test
  (testing "candidate-tables should work with an empty Table (no Fields)"
    (mt/with-temp* [Database [db]
                    Table    [_ {:db_id (:id db)}]]
      (mt/with-test-user :rasta
        (is (= []
               (candidate-tables db)))))))

(expect
 {:list-like?  true
  :link-table? false
  :num-fields 2}
 (tt/with-temp* [Database [{db-id :id}]
                 Table    [{table-id :id} {:db_id db-id}]
                 Field    [_ {:table_id table-id :special_type :type/PK}]
                 Field    [_ {:table_id table-id}]]
   (mt/with-test-user :rasta
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
    (mt/with-test-user :rasta
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

(deftest optimal-datetime-resolution-test
  (doseq [[m expected] [[{:earliest "2015"
                          :latest   "2017"}
                         :month]
                        [{:earliest "2017-01-01"
                          :latest   "2017-03-04"}
                         :day]
                        [{:earliest "2005"
                          :latest   "2017"}
                         :year]
                        [{:earliest "2017-01-01"
                          :latest   "2017-01-02"}
                         :hour]
                        [{:earliest "2017-01-01T00:00:00"
                          :latest   "2017-01-01T00:02:00"}
                         :minute]]
          :let         [fingerprint {:type {:type/DateTime m}}]]
    (testing (format "fingerprint = %s" (pr-str fingerprint))
      (is (= expected
             (#'magic/optimal-datetime-resolution {:fingerprint fingerprint}))))))


;;; ------------------- Datetime humanization (for chart and dashboard titles) -------------------

(deftest temporal-humanization-test
  (let [tz    "UTC"
        dt    #t "1990-09-09T12:30"
        t-str "1990-09-09T12:30:00"]
    (doseq [[unit expected] {:minute          (tru "at {0}" (t/format "h:mm a, MMMM d, YYYY" dt))
                             :hour            (tru "at {0}" (t/format "h a, MMMM d, YYYY" dt))
                             :day             (tru "on {0}" (t/format "MMMM d, YYYY" dt))
                             :week            (tru "in {0} week - {1}" (#'magic/pluralize (u.date/extract dt :week-of-year)) (str (u.date/extract dt :year)))
                             :month           (tru "in {0}" (t/format "MMMM YYYY" dt))
                             :quarter         (tru "in Q{0} - {1}" (u.date/extract dt :quarter-of-year) (str (u.date/extract dt :year)))
                             :year            (t/format "YYYY" dt)
                             :day-of-week     (t/format "EEEE" dt)
                             :hour-of-day     (tru "at {0}" (t/format "h a" dt))
                             :month-of-year   (t/format "MMMM" dt)
                             :quarter-of-year (tru "Q{0}" (u.date/extract dt :quarter-of-year))
                             :minute-of-hour  (u.date/extract dt :minute-of-hour)
                             :day-of-month    (u.date/extract dt :day-of-month)
                             :week-of-year    (u.date/extract dt :week-of-year)}]
      (testing (format "unit = %s" unit)
        (is (= (str expected)
               (str (#'magic/humanize-datetime t-str unit))))))))

(deftest pluralize-test
  (are [expected n] (= (str expected)
                       (str (#'magic/pluralize n)))
    (tru "{0}st" 1)   1
    (tru "{0}nd" 22)  22
    (tru "{0}rd" 303) 303
    (tru "{0}th" 0)   0
    (tru "{0}th" 8)   8))

(deftest handlers-test
  (testing "Make sure we have handlers for all the units available"
    (doseq [unit (disj (set (concat u.date/extract-units u.date/truncate-units))
                       :iso-day-of-week :iso-day-of-year :iso-week :iso-week-of-year :millisecond)]
      (testing unit
        (is (some? (#'magic/humanize-datetime "1990-09-09T12:30:00" unit)))))))
