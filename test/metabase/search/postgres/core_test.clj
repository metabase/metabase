(ns metabase.search.postgres.core-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.search :refer [is-postgres?]]
   [metabase.search.postgres.core :as search.postgres]
   [metabase.search.postgres.index-test :refer [legacy-results]]
   [metabase.test :as mt]
   [toucan2.realize :as t2.realize]))

(def ^:private hybrid
  (comp t2.realize/realize #'search.postgres/hybrid))

(def ^:private hybrid-multi #'search.postgres/hybrid-multi)

(def ^:private minimal #'search.postgres/minimal)

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defmacro with-setup [& body]
  `(when (is-postgres?)
     ;; TODO add more extensive data to search
     (mt/dataset ~'test-data
       (search.postgres/init! true)
       ~@body)))

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
    ;; Lucky Pidgeon, Crowberto Corv, Rasta Toucan
    ;; ... plus any additional ones that leaked in from dev or other tests
    (is (<= 3 (count (hybrid "collection"))))
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
                 (hybrid-multi term))))))))

(defn- remove-time [m]
  (dissoc m :created_at :updated_at :last_edited_at))

(deftest minimal-test
  (with-setup
    (testing "consistent results between both hybrid implementations\n"
      (doseq [term example-terms]
        (testing term
          ;; Timestamps are not strings after round trip, but this doesn't matter
          (is (= (map remove-time (hybrid term))
                 (map remove-time (minimal term)))))))))
