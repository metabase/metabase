(ns metabase.automagic-dashboards.core-test
  (:require [clojure.core.async :as a]
            [clojure.test :refer :all]
            [java-time :as t]
            [metabase.api.common :as api]
            [metabase.automagic-dashboards.core :as magic]
            [metabase.automagic-dashboards.rules :as rules]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models :refer [Card Collection Database Field Metric Table]]
            [metabase.models.field :as field]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as perms-group]
            [metabase.models.query :as query :refer [Query]]
            [metabase.query-processor.async :as qp.async]
            [metabase.test :as mt]
            [metabase.test.automagic-dashboards :as automagic-dashboards.test]
            [metabase.util :as u]
            [metabase.util.date-2 :as u.date]
            [metabase.util.i18n :refer [tru]]
            [schema.core :as s]
            [toucan.db :as db]))

;;; ------------------- `->reference` -------------------

(deftest ->reference-test
  (is (= [:field 1 nil]
         (->> (assoc (field/->FieldInstance) :id 1)
              (#'magic/->reference :mbql))))

  (is (= [:field 2 {:source-field 1}]
         (->> (assoc (field/->FieldInstance) :id 1 :fk_target_field_id 2)
              (#'magic/->reference :mbql))))

  (is (= 42
         (->> 42
              (#'magic/->reference :mbql)))))


;;; ------------------- Rule matching  -------------------

(deftest rule-matching-test
  (is (= [:entity/UserTable :entity/GenericTable :entity/*]
         (->> (mt/id :users)
              Table
              (#'magic/->root)
              (#'magic/matching-rules (rules/get-rules ["table"]))
              (map (comp first :applies_to)))))

  (testing "Test fallback to GenericTable"
    (is (= [:entity/GenericTable :entity/*]
           (->> (-> (mt/id :users)
                    Table
                    (assoc :entity_type nil)
                    (#'magic/->root))
                (#'magic/matching-rules (rules/get-rules ["table"]))
                (map (comp first :applies_to)))))))


;;; ------------------- `automagic-anaysis` -------------------

(defn- test-automagic-analysis
  ([entity card-count] (test-automagic-analysis entity nil card-count))
  ([entity cell-query card-count]
   ;; We want to both generate as many cards as we can to catch all aberrations, but also make sure
   ;; that size limiting works.
   (testing (u/pprint-to-str (list 'automagic-analysis entity {:cell-query cell-query, :show :all}))
     (automagic-dashboards.test/test-dashboard-is-valid (magic/automagic-analysis entity {:cell-query cell-query, :show :all}) card-count))
   (when (or (nil? (#{(type Query) (type Card)} (type entity)))
             (#'magic/table-like? entity))
     (testing (u/pprint-to-str (list 'automagic-analysis entity {:cell-query cell-query, :show 1}))
       ;; 1 for the actual card returned + 1 for the visual display card = 2
       (automagic-dashboards.test/test-dashboard-is-valid (magic/automagic-analysis entity {:cell-query cell-query, :show 1}) 2)))))

;; These test names were named by staring at them for a while, so they may be misleading

(deftest automagic-analysis-test
  (mt/with-test-user :rasta
    (automagic-dashboards.test/with-dashboard-cleanup
      (doseq [[table cardinality] (map vector
                                       (db/select Table :db_id (mt/id) {:order-by [[:id :asc]]})
                                       [7 5 8 2])]
        (test-automagic-analysis table cardinality)))

    (automagic-dashboards.test/with-dashboard-cleanup
      (is (= 1
             (->> (magic/automagic-analysis (Table (mt/id :venues)) {:show 1})
                  :ordered_cards
                  (filter :card)
                  count))))))

(deftest weird-characters-in-names-test
  (mt/with-test-user :rasta
    (automagic-dashboards.test/with-dashboard-cleanup
      (-> (Table (mt/id :venues))
          (assoc :display_name "%Venues")
          (test-automagic-analysis 7)))))

;; Cardinality of cards genned from fields is much more labile than anything else
;; Not just with respect to drivers, but all sorts of other stuff that makes it chaotic
(deftest mass-field-test
    (mt/with-test-user :rasta
      (automagic-dashboards.test/with-dashboard-cleanup
        (doseq [field (db/select Field
                                 :table_id [:in (db/select-field :id Table :db_id (mt/id))]
                                 :visibility_type "normal"
                                 {:order-by [[:id :asc]]})]
          (is (pos? (count (:ordered_cards (magic/automagic-analysis field {})))))))))

(deftest metric-test
  (mt/with-temp Metric [metric {:table_id (mt/id :venues)
                                :definition {:aggregation [[:count]]}}]
    (mt/with-test-user :rasta
      (automagic-dashboards.test/with-dashboard-cleanup
        (test-automagic-analysis metric 8)))))

(deftest complicated-card-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp* [Collection [{collection-id :id}]
                    Card [{card-id :id} {:table_id      (mt/id :venues)
                                         :collection_id collection-id
                                         :dataset_query {:query    {:filter [:> [:field (mt/id :venues :price) nil] 10]
                                                                    :source-table (mt/id :venues)}
                                                         :type     :query
                                                         :database (mt/id)}}]]
      (mt/with-test-user :rasta
        (automagic-dashboards.test/with-dashboard-cleanup
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
          (test-automagic-analysis (Card card-id) 7))))))

(deftest query-breakout-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp* [Collection [{collection-id :id}]
                    Card [{card-id :id} {:table_id      (mt/id :venues)
                                         :collection_id collection-id
                                         :dataset_query {:query {:aggregation [[:count]]
                                                                 :breakout [[:field (mt/id :venues :category_id) nil]]
                                                                 :source-table (mt/id :venues)}
                                                         :type :query
                                                         :database (mt/id)}}]]
      (mt/with-test-user :rasta
        (automagic-dashboards.test/with-dashboard-cleanup
          (test-automagic-analysis (Card card-id) 17))))))

(deftest native-query-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp* [Collection [{collection-id :id}]
                    Card [{card-id :id} {:table_id      nil
                                         :collection_id collection-id
                                         :dataset_query {:native {:query "select * from users"}
                                                         :type :native
                                                         :database (mt/id)}}]]
      (mt/with-test-user :rasta
        (automagic-dashboards.test/with-dashboard-cleanup
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
          (test-automagic-analysis (Card card-id) 2))))))

(defn- result-metadata-for-query [query]
  (first
   (a/alts!!
    [(qp.async/result-metadata-for-query-async query)
     (a/timeout 1000)])))

(deftest explicit-filter-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (let [source-query {:query    {:source-table (mt/id :venues)}
                        :type     :query
                        :database (mt/id)}]
      (mt/with-temp* [Collection [{collection-id :id}]
                      Card [{source-id :id} {:table_id        (mt/id :venues)
                                             :collection_id   collection-id
                                             :dataset_query   source-query
                                             :result_metadata (mt/with-test-user :rasta (result-metadata-for-query source-query))}]
                      Card [{card-id :id} {:table_id      (mt/id :venues)
                                           :collection_id collection-id
                                           :dataset_query {:query    {:filter       [:> [:field "PRICE" {:base-type "type/Number"}] 10]
                                                                      :source-table (str "card__" source-id)}
                                                           :type     :query
                                                           :database mbql.s/saved-questions-virtual-database-id}}]]
        (mt/with-test-user :rasta
          (automagic-dashboards.test/with-dashboard-cleanup
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
            (test-automagic-analysis (Card card-id) 7)))))))

(deftest native-query-with-cards-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (let [source-query {:native   {:query "select * from venues"}
                        :type     :native
                        :database (mt/id)}]
      (mt/with-temp* [Collection [{collection-id :id}]
                      Card [{source-id :id} {:table_id        nil
                                             :collection_id   collection-id
                                             :dataset_query   source-query
                                             :result_metadata (mt/with-test-user :rasta (result-metadata-for-query source-query))}]
                      Card [{card-id :id} {:table_id      nil
                                           :collection_id collection-id
                                           :dataset_query {:query    {:filter       [:> [:field "PRICE" {:base-type "type/Number"}] 10]
                                                                      :source-table (str "card__" source-id)}
                                                           :type     :query
                                                           :database mbql.s/saved-questions-virtual-database-id}}]]
        (mt/with-test-user :rasta
          (automagic-dashboards.test/with-dashboard-cleanup
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
            (test-automagic-analysis (Card card-id) 8)))))))

(deftest card-breakout-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp* [Collection [{collection-id :id}]
                    Card [{card-id :id} {:table_id      (mt/id :venues)
                                         :collection_id collection-id
                                         :dataset_query {:query    {:aggregation  [[:count]]
                                                                    :breakout     [[:field (mt/id :venues :category_id) nil]]
                                                                    :source-table (mt/id :venues)}
                                                         :type     :query
                                                         :database (mt/id)}}]]
      (mt/with-test-user :rasta
        (automagic-dashboards.test/with-dashboard-cleanup
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
          (test-automagic-analysis (Card card-id) 17))))))

(deftest figure-out-table-id-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp* [Collection [{collection-id :id}]
                    Card [{card-id :id} {:table_id      nil
                                         :collection_id collection-id
                                         :dataset_query {:native   {:query "select * from users"}
                                                         :type     :native
                                                         :database (mt/id)}}]]
      (mt/with-test-user :rasta
        (automagic-dashboards.test/with-dashboard-cleanup
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
          (test-automagic-analysis (Card card-id) 2))))))

(deftest card-cell-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp* [Collection [{collection-id :id}]
                    Card [{card-id :id} {:table_id      (mt/id :venues)
                                         :collection_id collection-id
                                         :dataset_query {:query    {:filter       [:> [:field (mt/id :venues :price) nil] 10]
                                                                    :source-table (mt/id :venues)}
                                                         :type     :query
                                                         :database (mt/id)}}]]
      (mt/with-test-user :rasta
        (automagic-dashboards.test/with-dashboard-cleanup
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
          (-> card-id
              Card
              (test-automagic-analysis [:= [:field (mt/id :venues :category_id) nil] 2] 7)))))))


(deftest complicated-card-cell-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp* [Collection [{collection-id :id}]
                    Card [{card-id :id} {:table_id      (mt/id :venues)
                                         :collection_id collection-id
                                         :dataset_query {:query    {:filter       [:> [:field (mt/id :venues :price) nil] 10]
                                                                    :source-table (mt/id :venues)}
                                                         :type     :query
                                                         :database (mt/id)}}]]
      (mt/with-test-user :rasta
        (automagic-dashboards.test/with-dashboard-cleanup
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
          (-> card-id
              Card
              (test-automagic-analysis [:= [:field (mt/id :venues :category_id) nil] 2] 7)))))))


(deftest adhoc-filter-test
  (mt/with-test-user :rasta
    (automagic-dashboards.test/with-dashboard-cleanup
      (let [q (query/adhoc-query {:query {:filter [:> [:field (mt/id :venues :price) nil] 10]
                                          :source-table (mt/id :venues)}
                                  :type :query
                                  :database (mt/id)})]
        (test-automagic-analysis q 7)))))

(deftest adhoc-count-test
  (mt/with-test-user :rasta
    (automagic-dashboards.test/with-dashboard-cleanup
      (let [q (query/adhoc-query {:query {:aggregation [[:count]]
                                          :breakout [[:field (mt/id :venues :category_id) nil]]
                                          :source-table (mt/id :venues)}
                                  :type :query
                                  :database (mt/id)})]
        (test-automagic-analysis q 17)))))

(deftest adhoc-fk-breakout-test
  (mt/with-test-user :rasta
    (automagic-dashboards.test/with-dashboard-cleanup
      (let [q (query/adhoc-query {:query {:aggregation [[:count]]
                                          :breakout [[:fk-> (mt/id :checkins) (mt/id :venues :category_id)]]
                                          :source-table (mt/id :checkins)}
                                  :type :query
                                  :database (mt/id)})]
        (test-automagic-analysis q 17)))))

(deftest adhoc-filter-cell-test
  (mt/with-test-user :rasta
    (automagic-dashboards.test/with-dashboard-cleanup
      (let [q (query/adhoc-query {:query {:filter [:> [:field (mt/id :venues :price) nil] 10]
                                          :source-table (mt/id :venues)}
                                  :type :query
                                  :database (mt/id)})]
        (test-automagic-analysis q [:= [:field (mt/id :venues :category_id) nil] 2] 7)))))

(deftest join-splicing-test
  (mt/with-test-user :rasta
    (automagic-dashboards.test/with-dashboard-cleanup
      (let [join-vec    [{:source-table (mt/id :categories)
                          :condition    [:= [:field (mt/id :categories :id) nil] 1]
                          :strategy     :left-join
                          :alias        "Dealios" }]
            q           (query/adhoc-query {:query {:source-table (mt/id :venues)
                                                    :joins join-vec
                                                    :aggregation [[:sum [:field (mt/id :categories :id) {:join-alias "Dealios"}]]]}
                                            :type :query
                                            :database (mt/id)})
            res         (magic/automagic-analysis q {})
            cards       (vec (:ordered_cards res))
            join-member (get-in cards [2 :card :dataset_query :query :joins])]
        (is (= join-vec join-member))))))


;;; ------------------- /candidates -------------------

(deftest candidates-test
  (testing "/candidates"
    (testing "should work with the normal test-data DB"
      (mt/with-test-user :rasta
        (is (schema= [(s/one {:tables   (s/constrained [s/Any] #(= (count %) 4))
                              s/Keyword s/Any}
                             "first result")
                      s/Any]
                     (magic/candidate-tables (mt/db))))))

    (testing "should work with unanalyzed tables"
      (mt/with-test-user :rasta
        (mt/with-temp* [Database [{db-id :id}]
                        Table    [{table-id :id} {:db_id db-id}]
                        Field    [_ {:table_id table-id}]
                        Field    [_ {:table_id table-id}]]
          (automagic-dashboards.test/with-dashboard-cleanup
            (is (schema= [(s/one {:tables   [(s/one {:table    {:id       (s/eq table-id)
                                                                s/Keyword s/Any}
                                                     s/Keyword s/Any}
                                                    "first Table")]
                                  s/Keyword s/Any}
                                 "first result")]
                         (magic/candidate-tables (Database db-id))))))))))

(deftest call-count-test
  (mt/with-temp* [Database [{db-id :id}]
                  Table    [{table-id :id} {:db_id db-id}]
                  Field    [_ {:table_id table-id}]
                  Field    [_ {:table_id table-id}]]
    (mt/with-test-user :rasta
      ;; make sure the current user permissions set is already fetched so it's not included in the DB call count below
      @api/*current-user-permissions-set*
      (automagic-dashboards.test/with-dashboard-cleanup
        (let [database (Database db-id)]
          (db/with-call-counting [call-count]
            (magic/candidate-tables database)
            (is (= 4
                   (call-count)))))))))

(deftest empty-table-test
  (testing "candidate-tables should work with an empty Table (no Fields)"
    (mt/with-temp* [Database [db]
                    Table    [_ {:db_id (:id db)}]]
      (mt/with-test-user :rasta
        (is (= []
               (magic/candidate-tables db)))))))

(deftest enhance-table-stats-test
  (mt/with-temp* [Database [{db-id :id}]
                  Table    [{table-id :id} {:db_id db-id}]
                  Field    [_ {:table_id table-id :semantic_type :type/PK}]
                  Field    [_ {:table_id table-id}]]
    (mt/with-test-user :rasta
      (automagic-dashboards.test/with-dashboard-cleanup
        (is (= {:list-like?  true
                :link-table? false
                :num-fields 2}
               (-> (#'magic/enhance-table-stats [(Table table-id)])
                   first
                   :stats)))))))

(deftest enhance-table-stats-fk-test
  (mt/with-temp* [Database [{db-id :id}]
                  Table    [{table-id :id} {:db_id db-id}]
                  Field    [_ {:table_id table-id :semantic_type :type/PK}]
                  Field    [_ {:table_id table-id :semantic_type :type/FK}]
                  Field    [_ {:table_id table-id :semantic_type :type/FK}]]
    (mt/with-test-user :rasta
      (automagic-dashboards.test/with-dashboard-cleanup
        (is (= {:list-like?  false
                :link-table? true
                :num-fields 3}
               (-> (#'magic/enhance-table-stats [(Table table-id)])
                   first
                   :stats)))))))


;;; ------------------- Definition overloading -------------------

(deftest most-specific-definition-test
  (testing "Identity"
    (is (= :d1
           (-> [{:d1 {:field_type [:type/Category] :score 100}}]
               (#'magic/most-specific-definition)
               first
               key)))))

(deftest ancestors-definition-test
  (testing "Base case: more ancestors"
    (is (= :d2
           (-> [{:d1 {:field_type [:type/Category] :score 100}}
                {:d2 {:field_type [:type/State] :score 100}}]
               (#'magic/most-specific-definition)
               first
               key)))))

(deftest definition-tiebreak-test
  (testing "Break ties based on the number of additional filters"
    (is (= :d3
           (-> [{:d1 {:field_type [:type/Category] :score 100}}
                {:d2 {:field_type [:type/State] :score 100}}
                {:d3 {:field_type [:type/State]
                      :named      "foo"
                      :score      100}}]
               (#'magic/most-specific-definition)
               first
               key)))))

(deftest definition-tiebreak-score-test
  (testing "Break ties on score"
    (is (= :d2
           (-> [{:d1 {:field_type [:type/Category] :score 100}}
                {:d2 {:field_type [:type/State] :score 100}}
                {:d3 {:field_type [:type/State] :score 90}}]
               (#'magic/most-specific-definition)
               first
               key)))))

(deftest definition-tiebreak-precedence-test
  (testing "Number of additional filters has precedence over score"
    (is (= :d3
           (-> [{:d1 {:field_type [:type/Category] :score 100}}
                {:d2 {:field_type [:type/State] :score 100}}
                {:d3 {:field_type [:type/State]
                      :named      "foo"
                      :score      0}}]
               (#'magic/most-specific-definition)
               first
               key)))))


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
                       :iso-day-of-year :millisecond)]
      (testing unit
        (is (some? (#'magic/humanize-datetime "1990-09-09T12:30:00" unit)))))))
