(ns metabase-enterprise.library-branching.instance.base-test
  "The base of the app DB instance: one row, moved by a compare-and-swap, with the digests of the base content. The
  tests change the one base row of the app DB, so they are not parallel, and each puts the row back."
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.instance.base-test/with-no-base clojure.core/fn}}}
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase.app-db.core :as mdb]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db) features.tu/with-features)

(def ^:private c1 "1111111111111111111111111111111111111111")
(def ^:private c2 "2222222222222222222222222222222222222222")
(def ^:private c3 "3333333333333333333333333333333333333333")

(def ^:private digests
  {"LibraryCollection0001"               "aa"
   ["Sample Database" nil "ORDERS"]      "bb"
   ["Sample Database" "PUBLIC" "ORDERS"] "cc"})

(defn- reset-base! []
  (t2/query {:update :library_branching_base :set {:commit_id nil :digests nil} :where [:= :id 1]}))

(defn- do-with-no-base!
  [f]
  (reset-base!)
  (try
    (f (app-db/app-db-instance))
    (finally
      (reset-base!))))

(defmacro ^:private with-no-base
  "Binds `inst` to the app DB instance, with no base, for `body`; then clears the base again."
  [[inst] & body]
  `(do-with-no-base! (fn [~inst] ~@body)))

(deftest base-row-test
  (testing (str "the app DB has one base row, with no base before the first sync; app DB " (mdb/db-type))
    (with-no-base [inst]
      (is (= [{:id 1 :commit_id nil :digests nil}]
             (t2/query {:select [:id :commit_id :digests] :from [:library_branching_base]})))
      (is (nil? (instance/base inst)))
      (is (nil? (instance/base-digests inst nil))))))

(deftest set-base-is-a-compare-and-swap-test
  (testing (str "app DB " (mdb/db-type))
    (with-no-base [inst]
      (testing "from no base"
        (is (= :ok (instance/set-base! inst nil c1 digests)))
        (is (= c1 (instance/base inst)))
        (is (= digests (instance/base-digests inst c1))))
      (testing "an expected base that is not the base changes nothing, and names the base"
        (is (= {:moved c1} (instance/set-base! inst nil c2 {})))
        (is (= {:moved c1} (instance/set-base! inst c3 c2 {})))
        (is (= c1 (instance/base inst)))
        (is (= digests (instance/base-digests inst c1))))
      (testing "from the base"
        (is (= :ok (instance/set-base! inst c1 c2 {"LibraryCollection0001" "dd"})))
        (is (= c2 (instance/base inst)))
        (is (= {"LibraryCollection0001" "dd"} (instance/base-digests inst c2)))))))

(deftest digests-belong-to-their-commit-test
  (testing "the digests are given only for the commit that they were stored with"
    (with-no-base [inst]
      (instance/set-base! inst nil c1 digests)
      (is (nil? (instance/base-digests inst c2)))
      (is (nil? (instance/base-digests inst nil)))
      (is (= digests (instance/base-digests inst c1))))))

(deftest set-base-in-a-transaction-that-rolls-back-test
  (testing "set-base! runs in the current transaction: a rollback leaves the base as it was"
    (with-no-base [inst]
      (instance/set-base! inst nil c1 digests)
      (t2/with-transaction [_ nil {:rollback-only true}]
        (is (= :ok (instance/set-base! inst c1 c2 {})))
        (is (= c2 (instance/base inst))))
      (is (= c1 (instance/base inst)))
      (is (= digests (instance/base-digests inst c1))))))

(deftest concurrent-set-base-test
  (testing (str "of two moves from one base at the same time, exactly one succeeds; app DB " (mdb/db-type))
    (with-no-base [inst]
      (instance/set-base! inst nil c1 digests)
      (dotimes [_ 5]
        (let [start    (promise)
              from     (instance/base inst)
              futures  (mapv (fn [target]
                               (future @start [target (instance/set-base! inst from target {target "x"})]))
                             [c2 c3])
              _        (deliver start true)
              results  (mapv deref futures)
              winners  (filter (comp #{:ok} second) results)
              [winner] (first winners)]
          (is (= 1 (count winners)))
          (is (= [{:moved winner}] (remove #{:ok} (map second results))))
          (is (= winner (instance/base inst)))
          (is (= {winner "x"} (instance/base-digests inst winner)))
          ;; back to `c1`, so the next round starts from one base
          (is (= :ok (instance/set-base! inst winner c1 digests))))))))
