(ns metabase.db.util-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase.db.util :as mdb.u]
   [metabase.models.setting :refer [Setting]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest idempotent-insert!-test
  ;; We test both the case where the database protects against duplicates, and where it does not.
  ;; In the first case using the `idempotent-insert!` rather than a regular `or` prevents the application throwing an
  ;; exception when there are race conditions, whereas in prevents us from silently inserting duplicates. We test
  ;; both cases as only the latter case has the phantom read issue and therefore requires serializable isolation.
  (let [columns [:key :value]]
    (doseq [search-col columns]
      (testing (format "Testing idempotent insertion where the search column %s a uniqueness constraint in the db"
                       (if (= :key search-col) "has" "does not have"))

        ;; We cannot use with-temp, as it starts its own transaction, which stops us setting the isolation level.
        (let [search-value (str (random-uuid))
              other-col    (first (remove #{search-col} columns))]
          (try
            ;; ensure there is no database detritus
            (t2/delete! Setting search-col search-value)

            (let [threads  5
                  promises (atom [])
                  thunk    (fn []
                             (mdb.u/idempotent-insert!
                               (:key (t2/select-one Setting search-col search-value))
                               ;; Pause to ensure multiple threads hit the mutating path
                               (do (Thread/sleep 300)
                                   (t2/insert-returning-pk! Setting
                                                            search-col search-value
                                                            other-col (str (random-uuid))))))]

              ;; hit it
              (dotimes [_ threads]
                (swap! promises conj (future (thunk))))

              ;; Block on all the futures
              (doseq [p @promises] @p)

              (testing "Every call returns the same row"
                (let [id (:key (t2/select-one Setting search-col search-value))]
                  (is (= (repeat threads id)
                         (map deref @promises)))))

              (testing "We have not inserted any duplicates"
                (is (= 1 (count (t2/select Setting search-col search-value)))))

              (testing "Later calls will just return the existing row as well"
                (is (= (:key (t2/select-one Setting search-col search-value)) (thunk)))))

            ;; Since we couldn't use with-temp, we need to clean up manually.
            (finally
              (t2/delete! Setting search-col search-value))))))))
