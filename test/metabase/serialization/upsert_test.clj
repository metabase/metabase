(ns metabase.serialization.upsert-test
  (:require [clojure.data :as diff]
            [expectations :refer :all]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [database :refer [Database]]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [pulse :refer [Pulse]]
             [segment :refer [Segment]]
             [setting :refer [Setting]]
             [table :refer [Table]]
             [user :refer [User]]]
            [metabase.serialization.upsert :refer :all :as upsert]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.users :as users]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(def ^:private same? (comp nil? second diff/diff))

(defn- mutate
  [model e]
  (let [identity-constituent? (set (#'upsert/identity-condition model))]
    (into {} (for [[k v] e]
               [k (if (or (not (string? v))
                         (identity-constituent? k))
                    v
                    (str (gensym)))]))))

(def ^:private cards (delay
                      [{:name "My Card 1"
                        :table_id (data/id :venues)
                        :display :line
                        :creator_id (users/user->id :rasta)
                        :visualization_settings {}
                        :dataset_query {:query {:source-table (data/id :venues)}
                                        :type :query
                                        :database (data/id)}}
                       {:name "My Card 2"
                        :table_id (data/id :venues)
                        :display :line
                        :creator_id (users/user->id :rasta)
                        :visualization_settings {}
                        :dataset_query {:query {:source-table (data/id :venues)}
                                        :type :query
                                        :database (data/id)}}]))

(expect
  (tu/with-model-cleanup [Card]
    (let [existing-ids (mapv (comp u/get-id (partial db/insert! Card)) @cards)
          inserted-ids (vec (maybe-upsert-many! :skip Card @cards))]
      (= existing-ids inserted-ids))))

(expect
  (tu/with-model-cleanup [Card]
    (every? (fn [mode]
              (let [[e1 e2]   @cards
                    [id1 id2] (maybe-upsert-many! mode Card @cards)]
                (every? (partial apply same?) [[(Card id1) e1] [(Card id2) e2]])))
            [:skip :update])))

(expect
  (tu/with-model-cleanup [Card]
    (let [[e1 e2]           @cards
          id1               (u/get-id (db/insert! Card e1))
          e1-mutated        (mutate Card e1)
          [id1-mutated id2] (maybe-upsert-many! :update Card [e1-mutated e2])]
      (and (= id1 id1-mutated)
           (same? (Card id1-mutated) e1-mutated)
           (same? (Card id2) e2)))))


(defn- test-select-identical
  [model]
  (let [[e1 e2] (if (contains? (set (#'upsert/identity-condition model)) :name)
                  [{:name "a"} {:name "b"}]
                  [{} {}])]
    (tt/with-temp* [model [_ e1] ; create an additional entity so we're sure whe get the right one
                    model [{id :id} e2]]
      (let [e (model id)]
        (= (#'upsert/select-identical model e) e)))))

(expect
  (test-select-identical Collection))
(expect
  (test-select-identical Card))
(expect
  (test-select-identical Table))
(expect
  (test-select-identical Field))
(expect
  (test-select-identical Metric))
(expect
  (test-select-identical Segment))
(expect
  (test-select-identical Dashboard))
(expect
  (test-select-identical Database))
(expect
  (test-select-identical Pulse))
(expect
  (test-select-identical User))


(expect
  true
  (#'upsert/has-post-insert? User))
(expect
  false
  (#'upsert/has-post-insert? Table))
