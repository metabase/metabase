(ns metabase.models.metric-test
  (:require [expectations :refer :all]
            [metabase.models
             [database :refer [Database]]
             [metric :as metric :refer [Metric]]
             [table :refer [Table]]]
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer [fetch-user user->id]]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(def ^:private metric-defaults
  {:description             nil
   :how_is_this_calculated  nil
   :show_in_getting_started false
   :caveats                 nil
   :points_of_interest      nil
   :archived                false
   :definition              nil})

(defn- user-details
  [username]
  (dissoc (fetch-user username) :date_joined :last_login))

(defn- metric-details
  [{:keys [creator] :as metric}]
  (-> (dissoc metric :id :table_id :created_at :updated_at)
      (update :creator #(dissoc % :date_joined :last_login))))

;; retrieve-metrics
(expect
  [(merge
    metric-defaults
    {:creator_id (user->id :rasta)
     :creator    (user-details :rasta)
     :name       "Metric 1"})]
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id-1 :id}    {:db_id database-id}]
                  Table    [{table-id-2 :id}    {:db_id database-id}]
                  Metric   [{segement-id-1 :id} {:table_id table-id-1, :name "Metric 1", :description nil}]
                  Metric   [{metric-id-2 :id}   {:table_id table-id-2}]
                  Metric   [{metric-id3 :id}    {:table_id table-id-1, :archived true}]]
    (vec
     (for [metric (u/prog1 (metric/retrieve-metrics table-id-1)
                    (assert (= 1 (count <>))))]
       (update (dissoc (into {} metric) :id :table_id :created_at :updated_at)
               :creator (u/rpartial dissoc :date_joined :last_login))))))


;; Updating -- you should not be able to change the creator_id of a Metric
(expect
  UnsupportedOperationException
  (tt/with-temp Metric [{:keys [id]} {:creator_id (user->id :rasta)}]
    (db/update! Metric id {:creator_id (user->id :crowberto)})))

;; you shouldn't be able to set it to `nil` either
(expect
  UnsupportedOperationException
  (tt/with-temp Metric [{:keys [id]} {:creator_id (user->id :rasta)}]
    (db/update! Metric id {:creator_id nil})))

;; However calling `update!` with a value that is the same as the current value shouldn't throw an Exception
(expect
  true
  (tt/with-temp Metric [{:keys [id]} {:creator_id (user->id :rasta)}]
    (db/update! Metric id {:creator_id (user->id :rasta)})))


;; ## Metric Revisions

;; #'metric/serialize-metric
(expect
  (merge metric-defaults
         {:id          true
          :table_id    true
          :creator_id  (user->id :rasta)
          :name        "Toucans in the rainforest"
          :description "Lookin' for a blueberry"
          :definition  {:aggregation [[:count]]
                        :filter      [:> [:field-id 4] "2014-10-19"]}})
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id} {:db_id database-id}]
                  Metric   [metric         {:table_id   table-id
                                            :definition {:aggregation [[:count]]
                                                         :filter      [:and [:> [:field-id 4] "2014-10-19"]]}}]]
    (-> (#'metric/serialize-metric Metric (:id metric) metric)
        (update :id boolean)
        (update :table_id boolean))))

;; #'metric/diff-metrics

(expect
  {:definition  {:before {:filter [:> [:field-id 4] "2014-10-19"]}
                 :after  {:filter [:between [:field-id 4] "2014-07-01" "2014-10-19"]}}
   :description {:before "Lookin' for a blueberry"
                 :after  "BBB"}
   :name        {:before "Toucans in the rainforest"
                 :after  "Something else"}}
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id} {:db_id database-id}]
                  Metric   [metric         {:table_id   table-id
                                            :definition {:filter [:and [:> [:field-id 4] "2014-10-19"]]}}]]
    (#'metric/diff-metrics Metric metric (assoc metric
                                           :name        "Something else"
                                           :description "BBB"
                                           :definition  {:filter [:between [:field-id 4] "2014-07-01" "2014-10-19"]}))))

;; test case where definition doesn't change
(expect
  {:name {:before "A"
          :after  "B"}}
  (#'metric/diff-metrics Metric
                         {:name        "A"
                          :description "Unchanged"
                          :definition  {:filter [:and [:> 4 "2014-10-19"]]}}
                         {:name        "B"
                          :description "Unchanged"
                          :definition  {:filter [:and [:> 4 "2014-10-19"]]}}))

;; first version, so comparing against nil
(expect
  {:name        {:after  "A"}
   :description {:after "Unchanged"}
   :definition  {:after {:filter [:and [:> 4 "2014-10-19"]]}}}
  (#'metric/diff-metrics Metric
                         nil
                         {:name        "A"
                          :description "Unchanged"
                          :definition  {:filter [:and [:> 4 "2014-10-19"]]}}))

;; removals only
(expect
  {:definition  {:before {:filter [:and [:> 4 "2014-10-19"] [:= 5 "yes"]]}
                 :after  {:filter [:and [:> 4 "2014-10-19"]]}}}
  (#'metric/diff-metrics Metric
                         {:name        "A"
                          :description "Unchanged"
                          :definition  {:filter [:and [:> 4 "2014-10-19"] [:= 5 "yes"]]}}
                         {:name        "A"
                          :description "Unchanged"
                          :definition  {:filter [:and [:> 4 "2014-10-19"]]}}))



;; ## Metric Dependencies

(expect
  {:Segment #{2 3}}
  (metric/metric-dependencies
   Metric
   12
   {:definition {:breakout [[:field-id 4] [:field-id 5]]
                 :filter   [:and
                            [:> 4 "2014-10-19"]
                            [:= 5 "yes"]
                            [:segment 2]
                            [:segment 3]]}}))

(expect
  {:Segment #{1}}
  (metric/metric-dependencies
   Metric
   12
   {:definition {:aggregation [:metric 7]
                 :filter      [:and
                               [:> 4 "2014-10-19"]
                               [:= 5 "yes"]
                               [:or
                                [:segment 1]
                                [:!= 5 "5"]]]}}))

(expect
  {:Segment #{}}
  (metric/metric-dependencies
   Metric
   12
   {:definition {:aggregation nil
                 :filter      nil}}))
