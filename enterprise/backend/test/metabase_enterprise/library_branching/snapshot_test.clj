(ns metabase-enterprise.library-branching.snapshot-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [clojure.test.check :as tc]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase-enterprise.library-branching.test-util :as lb.tu]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:private metric-id "IW8kbqZVaMxdGtCM2F4U6")
(def ^:private collection-id "cOlQuErIeS0ExAmPlE2x1")
(def ^:private orders-key ["Sample Database" "PUBLIC" "ORDERS"])

(def ^:private metric
  {:kind  :metric
   :name  "Total Revenue"
   :place collection-id
   :refs  #{[:source-table [:env orders-key]] [:card collection-id]}
   :attrs {:display "scalar"}})

(def ^:private collection
  {:kind :collection :name "Revenue" :place nil :refs #{} :attrs {}})

(def ^:private example
  {collection-id collection
   metric-id     metric
   orders-key    {:kind :published-table :name "Orders" :place collection-id :refs #{} :attrs {}}})

(defn- valid? [s] (mr/validate ::snapshot/snapshot s))

(deftest ^:parallel may-contain-test
  (testing "may-contain has one entry for each kind, and names only kinds"
    (is (= snapshot/kinds (set (keys snapshot/may-contain))))
    (is (every? #(set/subset? % snapshot/kinds) (vals snapshot/may-contain)))))

(deftest ^:parallel snapshot-schema-test
  (testing "a snapshot of a collection, a metric and a published table validates"
    (is (valid? example))
    (is (valid? {})))
  (testing "an item has exactly the keys :kind :name :place :refs :attrs"
    (is (not (valid? (assoc-in example [metric-id :id] 12))))
    (is (not (valid? (update example metric-id dissoc :attrs))))
    (is (not (valid? (update example collection-id dissoc :place)))))
  (testing "the kind is in the closed set"
    (is (not (valid? (assoc-in example [metric-id :kind] :dashboard)))))
  (testing "the name is a non-empty string"
    (is (not (valid? (assoc-in example [metric-id :name] ""))))
    (is (not (valid? (assoc-in example [metric-id :name] nil)))))
  (testing "a place is an identity or nil"
    (is (not (valid? (assoc-in example [metric-id :place] 12))))
    (is (not (valid? (assoc-in example [metric-id :place] "not-an-entity-id")))))
  (testing "a reference is a [role target] pair; a target is an identity or [:env natural-key]"
    (is (not (valid? (assoc-in example [metric-id :refs] #{[:card 12]}))))
    (is (not (valid? (assoc-in example [metric-id :refs] #{[:card [:env []]]}))))
    (is (not (valid? (assoc-in example [metric-id :refs] #{["card" metric-id]}))))
    (is (not (valid? (assoc-in example [metric-id :refs] [[:card metric-id]])))))
  (testing "attribute keys are keywords"
    (is (not (valid? (assoc-in example [metric-id :attrs] {"display" "scalar"})))))
  (testing "a published table has a table natural key as its identity; every other kind has an entity id"
    (is (not (valid? (-> example (dissoc orders-key) (assoc "oRdErStAbLeEnTiTyId00" (get example orders-key))))))
    (is (not (valid? (-> example (dissoc metric-id) (assoc ["Sample Database" "PUBLIC" "REVENUE"] metric)))))
    (is (not (valid? (-> example (dissoc orders-key) (assoc ["Sample Database" "ORDERS"] (get example orders-key))))))
    (is (valid? (-> example (dissoc orders-key) (assoc ["Sample Database" nil "ORDERS"] (get example orders-key)))))))

(defspec well-formed-snapshots-validate-test 200
  (prop/for-all [s (lb.tu/well-formed-snapshot-gen)]
    (and (valid? s) (lb.tu/well-formed? s))))

(defspec arbitrary-snapshots-validate-test 200
  (prop/for-all [s (lb.tu/arbitrary-snapshot-gen)]
    (valid? s)))

(defn- samples
  "200 values of generator `g` at size 30, from fixed seeds."
  [g]
  (mapv #(gen/generate g 30 %) (range 200)))

(defn- depth
  [s id]
  (count (take-while some? (iterate #(:place (get s %)) (:place (get s id))))))

(defn- sibling-clash?
  [s]
  (some #(< 1 %) (vals (frequencies (map (juxt :place :kind :name) (vals s))))))

(deftest ^:parallel arbitrary-snapshot-gen-faults-test
  (testing "the arbitrary generator gives each kind of structural fault"
    (let [ss (samples (lb.tu/arbitrary-snapshot-gen))]
      (is (some (complement lb.tu/acyclic?) ss) "a containment cycle")
      (is (some (complement lb.tu/places-inside?) ss) "a place outside the snapshot")
      (is (some (complement lb.tu/refs-closed?) ss) "a dangling reference")
      (is (some (complement lb.tu/kinds-fit?) ss) "a kind that its container cannot contain"))))

(deftest ^:parallel well-formed-snapshot-gen-coverage-test
  (testing "the well-formed generator gives the structures that the format and the engine must handle"
    (let [ss (samples (lb.tu/well-formed-snapshot-gen))]
      (is (some (fn [s] (some #(<= 3 (depth s %)) (keys s))) ss) "an item three levels deep")
      (is (some sibling-clash? ss) "two siblings with one name and one kind")
      (is (some #(= snapshot/kinds (set (map :kind (vals %)))) ss) "every kind in one snapshot")
      (is (some (fn [s] (some (fn [[_ target]] (lb.tu/env-target? target)) (mapcat :refs (vals s)))) ss)
          "a reference to the environment")
      (is (some (fn [s] (some (fn [[id {:keys [refs]}]] (some #(= [id] (rest %)) refs)) s)) ss)
          "an item that refers to itself")))
  (testing "options restrict the kinds at the root level and in containers"
    (let [ss (samples (lb.tu/well-formed-snapshot-gen {:root-kinds #{:collection}
                                                       :may-contain {:collection #{:collection :metric}}}))]
      (is (every? (fn [s] (every? #(or (:place %) (= :collection (:kind %))) (vals s))) ss))
      (is (every? (fn [s] (every? #{:collection :metric} (map :kind (vals s)))) ss))
      (is (every? #(lb.tu/well-formed? % {:collection #{:collection :metric}}) ss))))
  (testing "a snapshot has at most min(size, :max-items) items"
    (is (every? #(<= (count %) 5) (map #(gen/generate (lb.tu/well-formed-snapshot-gen) 5 %) (range 50))))
    (is (every? #(<= (count %) 3) (samples (lb.tu/well-formed-snapshot-gen {:max-items 3}))))))

(deftest ^:parallel well-formed-snapshot-gen-shrinks-test
  (testing "a failure on a snapshot with an item two levels deep shrinks to three items"
    (let [result (tc/quick-check 200
                   (prop/for-all [s (lb.tu/well-formed-snapshot-gen)]
                     (not-any? #(<= 2 (depth s %)) (keys s)))
                   :seed 1)
          [smallest] (get-in result [:shrunk :smallest])]
      (is (false? (:pass? result)))
      (is (= 3 (count smallest)))
      (is (every? #(and (= :collection (:kind %)) (empty? (:refs %)) (empty? (:attrs %))) (vals smallest))))))

(deftest ^:parallel well-formed-snapshot-gen-timing-test
  (testing "1,000 well-formed snapshots of size up to 30"
    (let [g     (lb.tu/well-formed-snapshot-gen)
          start (System/nanoTime)
          ss    (mapv #(gen/generate g (mod % 31) %) (range 1000))
          ms    (/ (- (System/nanoTime) start) 1e6)]
      (log/infof "Generated %d well-formed snapshots (%d items) in %.0f ms"
                 (count ss) (reduce + (map count ss)) ms)
      (is (= 1000 (count ss))))))
