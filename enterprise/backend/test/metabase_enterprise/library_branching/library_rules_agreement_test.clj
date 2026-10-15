(ns metabase-enterprise.library-branching.library-rules-agreement-test
  "Validate refuses a snapshot iff master's Library content check refuses one of its items: for every pair of a
  container type and an item that a collection can hold, the verdict of validate equals the verdict of
  `check-library-content` for that item in a collection of that type."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.engine.test-util :as engine.tu]
   [metabase-enterprise.library-branching.engine.validate :as validate]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library.db :as library.db]
   [metabase-enterprise.library.validation :as library.validation]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db) features.tu/with-features)

(def ^:private container-types
  "The types of the container: none, each Library type, and two others."
  [nil "library" "library-data" "library-metrics" "library-dashboards" "trash" "remote-synced"])

(def ^:private items
  "`[item content-type]`: an item of each kind that a collection can hold, and the content type that master's model
  passes to the check when it saves that item (the call sites of `collection/check-allowed-content`)."
  (let [dashboard (engine.tu/eid "dashboard")]
    (into [[(engine.tu/item :collection "C" nil) :collection]
           [(engine.tu/item :dashboard "D" nil) :model/Dashboard]
           [(engine.tu/item :metric "M" nil) :metric]
           [(engine.tu/item :model "M" nil) :model]
           [(engine.tu/item :question "Q" nil) :question]
           [(assoc-in (engine.tu/item :question "Q" nil #{[:dashboard dashboard]}) [:attrs :dashboard_id] dashboard)
            :dashboard-question]
           [(engine.tu/item :published-table "T" nil) :table]
           [(engine.tu/item :snippet "S" nil) :model/NativeQuerySnippet]
           [(engine.tu/item :timeline "T" nil) :model/Timeline]
           [(engine.tu/item :action "A" nil) :action]]
          (for [t (remove nil? container-types)]
            [(assoc-in (engine.tu/item :collection "C" nil) [:attrs :type] t) t]))))

(defn- master-allows?
  "True iff master's Library content check lets a collection of type `t` hold content of `content-type`."
  [t content-type]
  (mt/with-dynamic-fn-redefs [library.db/collection-type (constantly t)]
    (try
      (library.validation/check-library-content content-type 1)
      true
      (catch ExceptionInfo _ false))))

(def ^:private container (engine.tu/eid "container"))
(def ^:private item-id (engine.tu/eid "item"))
(def ^:private table-id ["Sample Database" "PUBLIC" "ORDERS"])
(def ^:private dashboard-id (engine.tu/eid "dashboard"))

(defn- validate-allows?
  "True iff validate gives no finding of a Library rule for `item` in a collection of type `t`."
  [t item]
  (let [id (if (= :published-table (:kind item)) table-id item-id)
        s  {container    (cond-> (engine.tu/item :collection "Container" nil) t (assoc-in [:attrs :type] t))
            id           (assoc item :place container)
            dashboard-id (engine.tu/item :dashboard "Dashboard" nil)}]
    (empty? (filter (comp #{:library-content :table-collection} :rule)
                    (validate/validate s {:may-contain {:collection #{:collection :dashboard :metric :model :question
                                                                      :published-table :snippet :timeline :action}}})))))

(deftest validate-agrees-with-master-test
  (testing "each pair of a container type and an item has one verdict in validate and in master"
    (doseq [t                   container-types
            [item content-type] items]
      (testing (pr-str [t (:kind item) content-type])
        (is (= (master-allows? t content-type) (validate-allows? t item)))))))

(deftest agreement-sees-refusals-test
  (testing "master refuses some pairs and allows others, so the agreement test compares both verdicts"
    (let [verdicts (set (for [t container-types, [_ content-type] items] (master-allows? t content-type)))]
      (is (= #{true false} verdicts)))))
