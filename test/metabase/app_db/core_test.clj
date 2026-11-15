(ns metabase.app-db.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.core :as mdb]))

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
