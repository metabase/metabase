(ns metabase.app-db.quartz-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.connection-pool-setup :as mdb.connection-pool-setup]
   [metabase.app-db.data-source :as mdb.data-source]
   [metabase.app-db.quartz :as mdb.quartz]
   [metabase.classloader.core :as classloader]
   [metabase.config.core :as config]
   [toucan2.connection :as t2.conn])
  (:import
   (com.mchange.v2.c3p0 DataSources)
   (java.sql Connection)
   (org.quartz.utils ConnectionProvider)))

(set! *warn-on-reflection* true)

(defn- h2-data-source ^javax.sql.DataSource [db-name]
  (mdb.data-source/raw-connection-string->DataSource (str "jdbc:h2:mem:" db-name ";DB_CLOSE_DELAY=-1")))

(deftest getConnection-ignores-bound-connection-test
  (testing "the provider fetches a fresh connection even when toucan2's *current-connectable* is bound to a Connection"
    (let [data-source (h2-data-source "quartz-provider-test")
          app-db      (mdb.connection/application-db :h2 data-source)]
      (binding [mdb.connection/*application-db* app-db]
        (with-open [^Connection outer (.getConnection data-source)]
          (binding [t2.conn/*current-connectable* outer]
            (let [^ConnectionProvider provider (mdb.quartz/->ConnectionProvider)]
              (with-open [^Connection conn (.getConnection provider)]
                (is (instance? Connection conn))
                (is (not (identical? outer conn))
                    "Quartz must never reuse the Connection bound to the calling thread")
                ;; also guard against a *wrapper* around the bound connection (as the old non-closeable-proxy
                ;; approach used): unwrapping must not lead back to the bound connection
                (is (not (identical? outer (.unwrap conn Connection)))
                    "the Quartz connection must be a different physical connection, not a wrapper around the bound one"))
              (testing "closing the Quartz connection must not close the bound connection"
                (is (not (.isClosed outer)))))))))))

(deftest no-deadlock-when-main-pool-saturated-test
  (testing "a Quartz operation from a thread holding the main pool's last connection completes (UXW-307)"
    (let [orig-props @#'mdb.connection-pool-setup/application-db-connection-pool-props]
      (with-redefs-fn {#'mdb.connection-pool-setup/application-db-connection-pool-props
                       (fn []
                         (assoc (orig-props)
                                "maxPoolSize"     1
                                "minPoolSize"     1
                                "initialPoolSize" 1
                                ;; if the fix ever regresses, fail fast with a checkout exception instead of
                                ;; hanging the test until the deref timeout below
                                "checkoutTimeout" 3000))}
        (fn []
          (let [data-source (h2-data-source "quartz-deadlock-test")
                app-db      (mdb.connection/application-db :h2 data-source :create-pool? true)]
            (try
              (binding [mdb.connection/*application-db* app-db]
                ;; saturate the main pool by checking out its only connection...
                (with-open [^Connection main-conn (.getConnection ^javax.sql.DataSource app-db)]
                  ;; ...and simulate being inside a `with-transaction` block on it
                  (binding [t2.conn/*current-connectable* main-conn]
                    (let [^ConnectionProvider provider (mdb.quartz/->ConnectionProvider)
                          result                       (future
                                                         (with-open [^Connection conn (.getConnection provider)]
                                                           (with-open [stmt (.createStatement conn)]
                                                             (with-open [rs (.executeQuery stmt "SELECT 1")]
                                                               (.next rs)
                                                               (.getInt rs 1)))))]
                      (is (= 1 (deref result 10000 ::deadlocked))
                          "the Quartz connection must come from the dedicated pool, not the saturated main pool")))))
              (finally
                (DataSources/destroy ^javax.sql.DataSource (:data-source app-db))
                (DataSources/destroy ^javax.sql.DataSource (:quartz-data-source app-db))))))))))

(deftest current-class-name-test
  (let [history [["a.Oldest" "a.Old" "a.Current"]
                 ["b.Old" "b.Current"]]]
    (are [stored-name expected] (= expected (mdb.quartz/current-class-name history stored-name))
      ;; every old name maps to the current one
      "a.Oldest"  "a.Current"
      "a.Old"     "a.Current"
      "b.Old"     "b.Current"
      ;; current and unlisted names stay as they are
      "a.Current" "a.Current"
      "c.Other"   "c.Other")))

(defn- class-exists? [class-name]
  (letfn [(loaded? []
            (try
              (some? (Class/forName class-name false (classloader/the-classloader)))
              (catch ClassNotFoundException _
                false)))]
    ;; a job class is a `deftype`, which exists only once its namespace has loaded
    (or (loaded?)
        (and (try
               (require (symbol (str/replace (str/replace class-name #"\.[^.]+$" "") "_" "-")))
               true
               (catch java.io.FileNotFoundException _
                 false))
             (loaded?)))))

(defn- simple-name [class-name]
  (last (str/split class-name #"\.")))

(deftest job-class-history-test
  (testing "no name belongs to two jobs, or twice to one"
    (let [names (mapcat identity mdb.quartz/job-class-history)]
      (is (= [] (for [[class-name n] (frequencies names) :when (> n 1)] class-name)))))
  ;; only a namespace move keeps the job, so every name of one job has the same simple name, and no two jobs share one
  (testing "each job keeps its simple name"
    (is (= [] (remove #(apply = (map simple-name %)) mdb.quartz/job-class-history))))
  (testing "no two jobs share a simple name"
    (let [simple-names (map (comp simple-name peek) mdb.quartz/job-class-history)]
      (is (= [] (for [[s n] (frequencies simple-names) :when (> n 1)] s)))))
  (testing "jobs are listed by simple name"
    (let [simple-names (map (comp simple-name peek) mdb.quartz/job-class-history)]
      (is (= (sort simple-names) simple-names))))
  (doseq [names mdb.quartz/job-class-history
          :when (or config/ee-available?
                    (not (str/starts-with? (peek names) "metabase_enterprise.")))]
    (testing (peek names)
      (is (= {:current-exists? true, :old-names-that-exist []}
             {:current-exists?      (class-exists? (peek names))
              :old-names-that-exist (filterv class-exists? (pop names))})))))
