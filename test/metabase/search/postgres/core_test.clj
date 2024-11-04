(ns metabase.search.postgres.core-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [macaw.util :as u]
   [metabase.db :as mdb]
   [metabase.models :as models]
   [metabase.search :as search]
   [metabase.search.postgres.core :as search.postgres]
   [metabase.search.postgres.index-test :refer [legacy-results]]
   [metabase.test :as mt]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(comment
  ;; We load this to ensure all the search-models are registered
  models/keep-me)

(def ^:private hybrid
  (comp t2.realize/realize #'search.postgres/hybrid))

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defmacro with-setup [& body]
  `(when (= :postgres (mdb/db-type))
     ;; TODO add more extensive data to search
     (mt/dataset ~'test-data
       (mt/with-temp [:model/User       {user-id# :id} {:email "someone@somewhere.com"}]
         (t2/insert! :model/Collection {:name "Some Collection" :personal_owner_id user-id#})
         (search.postgres/init! true)
         ~@body))))

(def ^:private example-terms
  "Search queries which should give consistent, non-trivial results across engines, for the test data."
  [#_nil "data" "dash" "peop" "venue" "rasta"])

(deftest hybrid-test
  (with-setup
    (testing "consistent results between all searches for certain queries\n"
      (doseq [term example-terms]
        (testing (str "consistent results, but not ordering\n" term)
          (is (= (set (legacy-results term))
                 (set (hybrid term)))))))))

(deftest permissions-test
  (with-setup
    ;; Rasta Toucan has friends, like Lucky Pidgeon
    ;; ... plus any additional ones that leaked in from dev or other tests
    (is (< 1 (count (hybrid "collection"))))
    (testing "Rasta can only see his own collections"
      (is (= ["Rasta Toucan's Personal Collection"]
             (->> {:current-user-id    (mt/user->id :rasta)
                   :is-superuser?      false
                   :current-user-perms #{"/none/"}}
                  (hybrid "collection")
                  (map :name)
                  ;; These can seep in from other tests T_T
                  (remove #(str/includes? % "trash"))))))))

(deftest hybrid-multi-test
  (with-setup
    (testing "consistent results between both hybrid implementations\n"
      (doseq [term example-terms]
        (testing term
          (is (= (hybrid term)
                 (#'search.postgres/hybrid-multi term))))))))

(defn- normalize* [xs]
  (into #{}
        (map (comp #(dissoc % :bookmark)
                   u/strip-nils
                   #(update % :archived boolean)))
        xs))

(deftest minimal-test
  (with-setup
    (testing "consistent results with minimal implementations\n"
      (doseq [term example-terms]
        (testing term
          ;; there is no ranking, so order is non-deterministic
          (is (= (normalize* (hybrid term))
                 (normalize* (#'search.postgres/minimal term)))))))))

(deftest minimal-with-perms-test
  (with-setup
    (testing "consistent results with minimal implementations\n"
      (doseq [term (take 1 example-terms)]
        (testing term
          ;; there is no ranking, so order is non-deterministic
          (is (= (normalize* (hybrid term))
                 (normalize* (#'search.postgres/minimal-with-perms
                              term
                              {:current-user-id    (mt/user->id :crowberto)
                               :is-superuser?      true
                               :archived?          false
                               :current-user-perms #{"/"}
                               :model-ancestors?   false
                               :models             search/all-models
                               :search-string      term})))))))))
