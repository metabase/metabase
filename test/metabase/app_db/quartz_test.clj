(ns metabase.app-db.quartz-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.connection-pool-setup :as mdb.connection-pool-setup]
   [metabase.app-db.data-source :as mdb.data-source]
   [metabase.app-db.quartz :as mdb.quartz]
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

(deftest add-renamed-job-class-test
  (let [add #'mdb.quartz/add-renamed-job-class]
    (testing "adds a rename, and adding the same one again changes nothing"
      (is (= {"a.Old" "a.New", "b.Old" "b.New"}
             (add {"a.Old" "a.New"} "b.Old" "b.New")))
      (is (= {"a.Old" "a.New"}
             (add {"a.Old" "a.New"} "a.Old" "a.New"))))
    (testing "a class renamed twice maps both old names to its current one"
      (is (= {"a.Older" "a.New", "a.Old" "a.New"}
             (add {"a.Older" "a.New"} "a.Old" "a.New"))))
    (testing "rejects a rename that conflicts"
      (are [renames old-name current-name message] (thrown-with-msg? clojure.lang.ExceptionInfo message
                                                                     (add renames old-name current-name))
        ;; same name on both sides
        {}                "a.New" "a.New" #"can't be registered as its own old name"
        ;; one old name for two classes
        {"a.Old" "a.New"} "a.Old" "b.New" #"already registered as an old name of a\.New"
        ;; a current name that is registered as old
        {"a.Old" "a.New"} "b.Old" "a.Old" #"registered as an old name, so no class can have it now"
        ;; an old name that is registered as current
        {"a.Old" "a.New"} "a.New" "b.New" #"belongs to a current class, so it can't be an old name"))))

(deftest register-renamed-job-class!-rejects-a-name-that-still-names-a-class-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"still names a class"
                        (mdb.quartz/register-renamed-job-class! "java.lang.String" Object))))
