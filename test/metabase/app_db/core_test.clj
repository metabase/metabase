(ns metabase.app-db.core-test
  (:require
   [clojure.core.memoize :as memoize]
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

(deftest memoize-hits-for-application-db-test
  (let [calls (atom 0)
        rows  (atom {})
        f     (mdb/memoize-hits-for-application-db
               (fn [id]
                 (swap! calls inc)
                 (get @rows id)))]
    (testing "nil result is not cached, so row created after miss is found"
      (is (nil? (f 1)))
      (is (nil? (f 1)))
      (is (= 2 @calls))
      (swap! rows assoc 1 :one)
      (is (= :one (f 1)))
      (is (= 3 @calls)))
    (testing "found result is cached"
      (swap! rows assoc 1 :changed)
      (is (= :one (f 1)))
      (is (= 3 @calls)))
    (testing "false is cached as found result"
      (swap! rows assoc 2 false)
      (is (false? (f 2)))
      (is (false? (f 2)))
      (is (= 4 @calls)))
    (testing "cache is keyed by application DB, so different app DB recomputes"
      (mdb/with-application-db (assoc (mdb.connection/current-application-db) :id Integer/MAX_VALUE)
        (is (= :changed (f 1))))
      (is (= 5 @calls))
      (is (= :one (f 1))))
    (testing "cache stays introspectable for telemetry and counts only found results"
      (is (= 3 (count (memoize/snapshot f)))))))

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
