(ns metabase.app-db.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.core :as mdb]
   [metabase.global-system.system :as global-system]
   [metabase.global-system.test-util :as global-system.tu]
   [metabase.test :as mt]))

(deftest memoize-for-application-db-test
  (let [calls (atom 0)
        f     (mdb/memoize-for-application-db
               (fn [x]
                 (swap! calls inc)
                 (inc x)))]
    (testing "memoizes: the underlying fn runs once per distinct argument"
      (is (= 2 (f 1)))
      (is (= 2 (f 1)))
      (is (= 3 (f 2)))
      (is (= 2 @calls)))
    (testing "cache is keyed by application DB, so a different app DB recomputes"
      (mdb/with-application-db (assoc (mdb.connection/current-application-db) :id Integer/MAX_VALUE)
        (is (= 2 (f 1))))
      (is (= 3 @calls)))
    (testing "the cache is introspectable for telemetry (carries clojure.core.memoize cache metadata)"
      (is (some? (:clojure.core.memoize/cache (meta f)))))))

(deftest increment-app-db-unique-indentifier!-test
  (testing "inside a binding, the bump changes the bound DB's id and leaves the root's alone"
    (let [root-id (mdb/unique-identifier)]
      (is (= {:bound-id-changed? true
              :root-id-changed?  false}
             (let [bound-changed? (mdb/with-application-db (mdb.connection/current-application-db)
                                    (let [before (mdb/unique-identifier)]
                                      (mdb/increment-app-db-unique-indentifier!)
                                      (not= before (mdb/unique-identifier))))]
               {:bound-id-changed? bound-changed?
                :root-id-changed?  (not= root-id (mdb/unique-identifier))}))))))

(deftest app-db-starts-through-the-global-system-test
  (testing "the app DB registers with the global system, so a halt releases the migration locks, and only once"
    (let [handle   @#'mdb/app-db-component
          releases (atom [])
          halts?   #(global-system.tu/halts? handle)]
      (global-system.tu/with-root handle nil
        (mt/with-dynamic-fn-redefs [mdb/release-migration-locks! #(swap! releases conj %)]
          (try
            (mdb/start-app-db!)
            (let [after-start {:halts? (halts?), :releases @releases}]
              (mdb/stop-app-db!)
              (is (= {:after-start {:halts? true, :releases []}
                      :after-stop  {:halts? false, :releases [20]}}
                     {:after-start after-start
                      :after-stop  {:halts? (halts?), :releases @releases}})))
            (finally
              (global-system/stop! handle))))))))
