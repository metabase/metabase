(ns metabase-enterprise.entity-retrieval.index-table-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.entity-retrieval.index-table :as index-table]
   [metabase-enterprise.entity-retrieval.reconcile :as reconcile]
   [metabase.test :as mt]
   [metabase.util.log.capture :as log.capture]
   [next.jdbc :as jdbc]))

(deftest legacy-meta-table-without-ownership-test
  (testing "a grant-only role neither attempts ALTER nor repeatedly warns"
    (log.capture/with-log-messages-for-level [messages [metabase-enterprise.entity-retrieval.index-table :warn]]
      (let [executed (atom [])]
        (with-redefs-fn {#'index-table/meta-column-exists?              (constantly false)
                         #'index-table/can-alter-meta-table?            (constantly false)
                         #'index-table/warned-about-missing-reconciled-at (atom #{})
                         #'jdbc/execute!                                (fn [& args] (swap! executed conj args))}
          #(dotimes [_ 2]
             (is (false? (#'index-table/ensure-reconciled-at-column! ::tx)))))
        (is (empty? @executed))
        (is (= 1 (count (messages)))))))
  (testing "freshness stamping is a no-op while the optional column is unavailable"
    (with-redefs-fn {#'index-table/meta-column-exists? (constantly false)
                     #'jdbc/execute!                   (fn [& _] (throw (AssertionError. "unexpected write")))}
      #(is (nil? (index-table/touch-reconciled-at! ::tx ::reconciled-at)))))
  (testing "freshness stamping persists the caller's pre-read watermark"
    (let [statement (atom nil)]
      (with-redefs-fn {#'index-table/meta-column-exists? (constantly true)
                       #'jdbc/execute!                   (fn [_ sql] (reset! statement sql))}
        #(index-table/touch-reconciled-at! ::tx ::reconciled-at))
      (is (= ::reconciled-at (second @statement))))))

(deftest alter-meta-table-requires-usable-owner-role-test
  (let [query (atom nil)]
    (with-redefs-fn {#'jdbc/execute-one! (fn [_ [sql & _] _]
                                           (reset! query sql)
                                           {:owns_table false})}
      #(is (false? (#'index-table/can-alter-meta-table? ::tx))))
    (is (re-find #"pg_has_role\(c\.relowner, 'USAGE'\)" @query)
        "a NOINHERIT member cannot use the owner role's ALTER privilege without SET ROLE")))

(deftest reconcile-watermark-precedes-appdb-read-test
  (let [events (atom [])]
    (mt/with-dynamic-fn-redefs [reconcile/capture-reconcile-watermark (fn [_]
                                                                        (swap! events conj :clock)
                                                                        ::reconciled-at)
                                reconcile/desired-docs                (fn []
                                                                        (swap! events conj :appdb-read)
                                                                        [])
                                reconcile/stored-docs                 (constantly {})
                                reconcile/delete-rows!                (fn [& _])
                                reconcile/index-size                  (constantly {:documents 0 :entities 0})
                                index-table/touch-reconciled-at!      (fn [_ reconciled-at]
                                                                        (swap! events conj [:watermark reconciled-at]))]
      (#'reconcile/reconcile-against-appdb! ::conn ::embedding-model))
    (is (= [:clock :appdb-read [:watermark ::reconciled-at]] @events))))
