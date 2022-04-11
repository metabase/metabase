(ns metabase-enterprise.serialization.upsert-test
  (:require [clojure.data :as diff]
            [clojure.test :refer :all]
            [metabase-enterprise.serialization.upsert :as upsert]
            [metabase.models :refer [Card Collection Dashboard DashboardCard Database Field Metric NativeQuerySnippet
                                     Pulse Segment Table User]]
            [metabase.test :as mt]
            [metabase.util :as u]
            [toucan.db :as db]))

(def ^:private same? (comp nil? second diff/diff))

(defn- mutate
  [model e]
  (let [identity-constituent? (set (#'upsert/identity-condition model))]
    (into {} (for [[k v] e]
               [k (if (or (not (string? v))
                         (identity-constituent? k))
                    v
                    (str (gensym)))]))))

(def ^:private cards
  (delay [{:name                   "My Card 1"
           :table_id               (mt/id :venues)
           :display                :line
           :creator_id             (mt/user->id :rasta)
           :visualization_settings {}
           :dataset_query          {:query    {:source-table (mt/id :venues)}
                                    :type     :query
                                    :database (mt/id)}}
          {:name                   "My Card 2"
           :table_id               (mt/id :venues)
           :display                :line
           :creator_id             (mt/user->id :rasta)
           :visualization_settings {}
           :dataset_query          {:query    {:source-table (mt/id :venues)}
                                    :type     :query
                                    :database (mt/id)}}]))

;; TODO -- I'm not really clear on what these are testing, so I wasn't sure what to name them when I converted them to
;; the new style. Feel free to give them better names - Cam
(deftest maybe-upsert-many!-skip-test
  (mt/with-model-cleanup [Card]
    (let [existing-ids (mapv (comp u/the-id (partial db/insert! Card)) @cards)
          inserted-ids (vec (upsert/maybe-upsert-many! {:mode :skip} Card @cards))]
      (is (= existing-ids inserted-ids)))))

(deftest maybe-upsert-many!-same-objects-test
  (mt/with-model-cleanup [Card]
    (letfn [(test-mode [mode]
              (testing (format "Mode = %s" mode)
                (let [[e1 e2]   @cards
                      [id1 id2] (upsert/maybe-upsert-many! {:mode mode} Card @cards)]
                  (is (every? (partial apply same?)
                              [[(Card id1) e1] [(Card id2) e2]])))))]
      (doseq [mode [:skip :update]]
        (test-mode mode)))))

(deftest maybe-upsert-many!-update-test
  (mt/with-model-cleanup [Card]
    (let [[e1 e2]           @cards
          id1               (u/the-id (db/insert! Card e1))
          e1-mutated        (mutate Card e1)
          [id1-mutated id2] (upsert/maybe-upsert-many! {:mode :update} Card [e1-mutated e2])]
      (testing "Card 1 ID"
        (is (= id1 id1-mutated)))
      (testing "Card 1"
        (is (same? (Card id1-mutated) e1-mutated)))
      (testing "Card 2"
        (is (same? (Card id2) e2))))))

(defn- dummy-entity [dummy-dashboard model entity instance-num]
  (cond
    (= (type DashboardCard) (type model))
    ;; hack to make sure that :visualization_settings are slightly different between the two dummy instances
    ;; this is necessary because DashboardCards have that as part of their identity-condition
    (assoc entity :dashboard_id (u/the-id dummy-dashboard)
                  :visualization_settings (if (= 1 instance-num) {:column_settings {}}
                                                                 {:click_behavior {}}))

    :else
    entity))

(deftest identical-test
  (letfn [(test-select-identical [model]
            (testing (name model)
              (let [id-cond (#'upsert/identity-condition model)
                    [e1 e2] (if (contains? (set id-cond) :name)
                              [{:name "a"} {:name "b"}]
                              [{} {}])]
                (mt/with-temp* [Dashboard [dashboard {:name "Dummy Dashboard"}]
                                ;; create an additional entity so we're sure whe get the right one
                                model     [_ (dummy-entity dashboard model e1 1)]
                                model     [{id :id} (dummy-entity dashboard model e2 2)]]
                  (let [e (model id)]
                    ;; make sure that all columns in identity-condition actually exist in the model
                    (is (= (set id-cond) (-> e
                                             (select-keys id-cond)
                                             keys
                                             set)))
                    (is (= (#'upsert/select-identical model (cond-> e
                                                              ;; engine is a keyword but has to be a string for
                                                              ;; HoneySQL to not interpret it as a col name
                                                              (= (class e) (class Database)) (update :engine name)))
                           e)))))))]
    (doseq [model [Collection
                   Card
                   Table
                   Field
                   Metric
                   NativeQuerySnippet
                   Segment
                   Dashboard
                   DashboardCard
                   Database
                   Pulse
                   User]]
      (test-select-identical model))))

(deftest has-post-insert?-test
  (is (= true
         (#'upsert/has-post-insert? User)))
  (is (= false
         (#'upsert/has-post-insert? Table))))
