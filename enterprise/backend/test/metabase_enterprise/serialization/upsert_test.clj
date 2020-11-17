(ns metabase-enterprise.serialization.upsert-test
  (:require [clojure
             [data :as diff]
             [test :refer :all]]
            [metabase
             [models :refer [Card Collection Dashboard Database Field Metric Pulse Segment Table User]]
             [test :as mt]
             [util :as u]]
            [metabase-enterprise.serialization.upsert :as upsert]
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
    (let [existing-ids (mapv (comp u/get-id (partial db/insert! Card)) @cards)
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
          id1               (u/get-id (db/insert! Card e1))
          e1-mutated        (mutate Card e1)
          [id1-mutated id2] (upsert/maybe-upsert-many! {:mode :update} Card [e1-mutated e2])]
      (testing "Card 1 ID"
        (is (= id1 id1-mutated)))
      (testing "Card 1"
        (is (same? (Card id1-mutated) e1-mutated)))
      (testing "Card 2"
        (is (same? (Card id2) e2))))))

(deftest identical-test
  (letfn [(test-select-identical [model]
            (testing (name model)
              (let [[e1 e2] (if (contains? (set (#'upsert/identity-condition model)) :name)
                              [{:name "a"} {:name "b"}]
                              [{} {}])]
                (mt/with-temp* [model [_ e1] ; create an additional entity so we're sure whe get the right one
                                model [{id :id} e2]]
                  (let [e (model id)]
                    (is (= (#'upsert/select-identical model e) e)))))))]
    (doseq [model [Collection
                   Card
                   Table
                   Field
                   Metric
                   Segment
                   Dashboard
                   Database
                   Pulse
                   User]]
      (test-select-identical model))))

(deftest has-post-insert?-test
  (is (= true
         (#'upsert/has-post-insert? User)))
  (is (= false
         (#'upsert/has-post-insert? Table))))
