(ns metabase-enterprise.library-branching.reload-test
  "The reload of library-branching namespaces. The order is a pure function, checked on generated dependency graphs.
  The app DB test reloads the namespace of the instance protocols in this JVM, so it is not parallel."
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.reload-test-util :as reload-test-util]
   [metabase.collections.core :as collections]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;;; ------------------------------------------------ The order ------------------------------------------------

(defn- ns-sym [i] (symbol (str "n" i)))

(defn- picked
  "The namespaces of the indices whose flag in `flags` is true."
  [flags]
  (into #{} (keep-indexed (fn [i f] (when f (ns-sym i)))) flags))

(def ^:private case-gen
  "`{:deps d :changed c :loaded l}`: `d` is a dependency map of up to 12 namespaces in which a namespace requires only
  namespaces of a lower index, so the graph is acyclic by construction; `c` and `l` are sets of its namespaces."
  (gen/let [n       (gen/choose 1 12)
            deps    (apply gen/tuple (for [i (range n)] (gen/vector gen/boolean i)))
            changed (gen/vector gen/boolean n)
            loaded  (gen/vector gen/boolean n)]
    {:deps    (into {} (map-indexed (fn [i flags] [(ns-sym i) (picked flags)])) deps)
     :changed (picked changed)
     :loaded  (picked loaded)}))

(defn- closure
  "The namespaces that `n` requires in `deps`, directly or not."
  [deps n]
  (loop [seen #{} todo (vec (deps n))]
    (if-let [[m & more] (seq todo)]
      (if (seen m)
        (recur seen (vec more))
        (recur (conj seen m) (into (vec more) (deps m))))
      seen)))

(defn- order-of [{:keys [deps changed loaded]}]
  (reload-test-util/reload-order (reload-test-util/deps-graph deps) changed loaded))

(defspec reload-order-set-test 300
  (prop/for-all [{:keys [deps changed loaded] :as c} case-gen]
    (let [order (order-of c)]
      (and (apply distinct? ::sentinel order)
           (= (into changed
                    (filter #(and (loaded %) (some changed (closure deps %))))
                    (keys deps))
              (set order))))))

(defspec reload-order-dependencies-first-test 300
  (prop/for-all [{:keys [deps] :as c} case-gen]
    (let [order    (order-of c)
          position (zipmap order (range))]
      (every? (fn [n]
                (every? #(< (position %) (position n))
                        (filter position (closure deps n))))
              order))))

;;; ------------------------------------------------ The reload ------------------------------------------------

(deftest reload-refuses-an-unknown-namespace-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Not a namespace of library branching"
                        (reload-test-util/reload! 'metabase-enterprise.library-branching.instance
                                                  'metabase-enterprise.library-branching.no-such-namespace))))

(defn- children-location
  [{:keys [id location]}]
  (str location id "/"))

(deftest reload-keeps-kind-stores-test
  (testing "a plain reload of the namespace of the protocols leaves every kind store without the protocol"
    (require 'metabase-enterprise.library-branching.instance :reload)
    (is (not-any? #(satisfies? instance/KindStore %) (vals app-db/kind-stores))))
  (testing "a reload with the helper defines the kind stores again"
    (let [order (reload-test-util/reload! 'metabase-enterprise.library-branching.instance)]
      (is (= 'metabase-enterprise.library-branching.instance (first order)))
      (is (some #{'metabase-enterprise.library-branching.instance.app-db} order))
      (doseq [[kind ks] app-db/kind-stores]
        (testing kind
          (is (satisfies? instance/KindStore ks))
          (is (= {} (instance/read-all ks [])))))))
  (testing "a read of the synced snapshot reads each kind"
    (collections.tu/with-library [{:keys [metrics]}]
      (mt/with-temp [:model/Collection revenue {:name     "Revenue"
                                                :type     collections/library-metrics-collection-type
                                                :location (children-location metrics)}]
        (is (= {:kind  :collection
                :name  "Revenue"
                :place (:entity_id metrics)
                :refs  #{}
                :attrs {:type "library-metrics"}}
               (get (app-db/read-current) (:entity_id revenue))))))))
