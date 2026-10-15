(ns metabase-enterprise.library-branching.instance.key-move-test
  "Plans that move snippet names from one snippet to another, applied to the app DB instance: the app DB keeps snippet
  names unique over all rows, so a write that takes a name before the write that frees it fails. Each case writes in a
  transaction that rolls back."
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.engine.plan :as plan]
   [metabase-enterprise.library-branching.engine.test-util :as engine.tu]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase.app-db.core :as mdb]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def ^:private store (get app-db/kind-stores :snippet))

(defn- snippet
  [item-name]
  {:kind :snippet :name item-name :place "snippetssnippetssnipp" :refs #{} :attrs {:content "1 = 1"}})

(defn- apply-moves!
  "Writes a snippet named `name` for each `[id name]` of `l`, then plans the names `m` (`{id name}`, for those snippets
  and new ones) and applies the plan to the app DB instance, in a transaction that rolls back. Returns `{:result r
  :names {id name}}`: the result of the apply, and the names of the snippets of `m` after it; or `{:thrown message}`."
  [l m]
  (t2/with-transaction [_ nil {:rollback-only true}]
    (doseq [[id item-name] l]
      (instance/write! store id (snippet item-name)))
    (let [inst   (app-db/app-db-instance)
          local  (instance/read-all store (keys l))
          target (into {} (map (fn [[id item-name]] [id (snippet item-name)])) m)
          steps  (plan/plan local target local)]
      (try
        (let [result (instance/apply-plan! inst steps {:base     (instance/base inst)
                                                       :new-base "4444444444444444444444444444444444444444"
                                                       :digests  {}
                                                       :head-ok? (constantly true)})]
          {:result (first (keys result))
           :names  (update-vals (instance/read-all store (keys m)) :name)})
        (catch Exception e
          {:thrown (ex-message e)})))))

(def ^:private x "lbKeyMoveX00000000001")
(def ^:private y "lbKeyMoveY00000000001")
(def ^:private z "lbKeyMoveZ00000000001")
(def ^:private w "lbKeyMoveA00000000001")

(deftest key-moves-on-the-app-db-test
  (testing (str "app DB " (mdb/db-type))
    (testing "a rename frees a name, and a new snippet with a less identity takes it"
      (let [m {x "lb key move b" w "lb key move a"}]
        (is (= {:result :ok :names m} (apply-moves! {x "lb key move a"} m)))))
    (testing "a swap of two names"
      (let [m {x "lb key move b" y "lb key move a"}]
        (is (= {:result :ok :names m} (apply-moves! {x "lb key move a" y "lb key move b"} m)))))
    (testing "a rotation of three names"
      (let [m {x "lb key move b" y "lb key move c" z "lb key move a"}]
        (is (= {:result :ok :names m} (apply-moves! {x "lb key move a" y "lb key move b" z "lb key move c"} m)))))))

(defspec key-moves-on-the-app-db-property-test 40
  (prop/for-all [{:keys [l m]} (engine.tu/key-moves-gen "lb key move")]
    (= {:result :ok :names m} (apply-moves! l m))))
