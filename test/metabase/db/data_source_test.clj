(ns metabase.db.data-source-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.auth-provider :as auth-provider]
   [metabase.config :as config]
   [metabase.connection-pool :as connection-pool]
   [metabase.db.data-source :as mdb.data-source]
   [metabase.test :as mt])
  (:import
   (java.util Properties)))

(set! *warn-on-reflection* true)

(defn- ->DataSource [s properties]
  (#'mdb.data-source/->DataSource s (some-> (not-empty properties) connection-pool/map->properties)))

(deftest ^:parallel broken-out-details-test
  (testing :postgres
    (is (= (->DataSource
            "jdbc:postgresql://localhost:5432/metabase"
            {"password"                      "1234"
             "ApplicationName"               config/mb-version-and-process-identifier
             "OpenSourceSubProtocolOverride" "true"
             "user"                          "cam"})
           (mdb.data-source/broken-out-details->DataSource :postgres {:host     "localhost"
                                                                      :port     5432
                                                                      :user     "cam"
                                                                      :password "1234"
                                                                      :db       "metabase"}))))

  (testing :azure-managed-identity
    (is (= (->DataSource
            "jdbc:postgresql://localhost:5432/metabase"
            {"ApplicationName"                  config/mb-version-and-process-identifier
             "OpenSourceSubProtocolOverride"    "true"
             "user"                             "cam"
             "azure-managed-identity-client-id" "client ID"})
           (mdb.data-source/broken-out-details->DataSource :postgres {:host                             "localhost"
                                                                      :port                             5432
                                                                      :user                             "cam"
                                                                      :azure-managed-identity-client-id "client ID"
                                                                      :db                               "metabase"})))
    (testing "password takes precedence"
      (is (= (->DataSource
              "jdbc:postgresql://localhost:5432/metabase"
              {"password"                      "1234"
               "ApplicationName"               config/mb-version-and-process-identifier
               "OpenSourceSubProtocolOverride" "true"
               "user"                          "cam"})
             (mdb.data-source/broken-out-details->DataSource :postgres {:host                             "localhost"
                                                                        :port                             5432
                                                                        :user                             "cam"
                                                                        :password                         "1234"
                                                                        :azure-managed-identity-client-id "client ID"
                                                                        :db                               "metabase"})))))

  (testing :h2
    (is (= (->DataSource
            "jdbc:h2:file:/metabase/metabase.db"
            nil)
           (mdb.data-source/broken-out-details->DataSource :h2 {:db "file:/metabase/metabase.db"}))))

  (testing :mysql
    (is (= (->DataSource
            "jdbc:mysql://localhost:3306/metabase"
            {"user" "root"})
           (mdb.data-source/broken-out-details->DataSource :mysql {:host "localhost"
                                                                   :port 3306
                                                                   :user "root"
                                                                   :db   "metabase"}))))

  (testing "end-to-end"
    (let [data-source (mdb.data-source/broken-out-details->DataSource
                       :h2
                       {:subprotocol "h2"
                        :db          (format "mem:%s" (mt/random-name))
                        :classname   "org.h2.Driver"})]
      (with-open [conn (.getConnection data-source)]
        (is (= [{:one 1}]
               (jdbc/query {:connection conn} "SELECT 1 AS one;")))))))

(deftest ^:parallel connection-string-test
  (let [data-source (mdb.data-source/raw-connection-string->DataSource
                     (format "jdbc:h2:mem:%s" (mt/random-name)))]
    (with-open [conn (.getConnection data-source)]
      (is (= [{:one 1}]
             (jdbc/query {:connection conn} "SELECT 1 AS one;")))))

  (testing "Without jdbc: at the beginning"
    (let [db-name     (mt/random-name)
          data-source (mdb.data-source/raw-connection-string->DataSource
                       (format "h2:mem:%s" db-name))]
      (is (= (mdb.data-source/raw-connection-string->DataSource (str "jdbc:h2:mem:" db-name))
             data-source))
      (with-open [conn (.getConnection data-source)]
        (is (= [{:one 1}]
               (jdbc/query {:connection conn} "SELECT 1 AS one;"))))))

  (testing "Accept `postgres` as a subprotocol (I think Heroku or whatever does this to screw with us)"
    (is (= (mdb.data-source/raw-connection-string->DataSource "jdbc:postgresql://localhost:5432/metabase")
           (mdb.data-source/raw-connection-string->DataSource "postgres://localhost:5432/metabase")))))

(deftest ^:parallel wonky-connection-string-test
  (testing "Should handle malformed user:password@host:port strings (#14678, #20121)"
    (doseq [subprotocol ["postgresql" "mysql"]]
      (testing "user AND password"
        (is (= (->DataSource
                (str "jdbc:" subprotocol "://localhost:5432/metabase")
                {"user" "cam", "password" "1234"})
               (mdb.data-source/raw-connection-string->DataSource (str subprotocol "://cam:1234@localhost:5432/metabase"))))
        (testing "no port"
          (is (= (->DataSource
                  (str "jdbc:" subprotocol "://localhost/metabase")
                  {"user" "cam", "password" "1234"})
                 (mdb.data-source/raw-connection-string->DataSource (str subprotocol "://cam:1234@localhost/metabase"))))))
      (testing "user only"
        (is (= (->DataSource
                (str "jdbc:" subprotocol "://localhost:5432/metabase?password=1234")
                {"user" "cam"})
               (mdb.data-source/raw-connection-string->DataSource (str subprotocol "://cam@localhost:5432/metabase?password=1234"))))
        (testing "no port"
          (is (= (->DataSource
                  (str "jdbc:" subprotocol "://localhost/metabase?password=1234")
                  {"user" "cam"})
                 (mdb.data-source/raw-connection-string->DataSource (str subprotocol "://cam@localhost/metabase?password=1234")))))))))

(deftest ^:parallel raw-connection-string-with-separate-username-and-password-test
  (testing "Raw connection string should support separate username and/or password (#20122)"
    (testing "username and password"
      (is (= (->DataSource
              "jdbc:postgresql://metabase"
              {"user" "cam", "password" "1234"})
             (mdb.data-source/raw-connection-string->DataSource "postgres://metabase" "cam" "1234" nil)
             (mdb.data-source/raw-connection-string->DataSource "postgres://metabase" "cam" "1234" "client ID"))))
    (testing "username only"
      (is (= (->DataSource
              "jdbc:postgresql://metabase"
              {"user" "cam"})
             (mdb.data-source/raw-connection-string->DataSource "postgres://metabase" "cam" nil nil)
             (mdb.data-source/raw-connection-string->DataSource "postgres://metabase" "cam" "" nil))))
    (testing "username and azure-managed-identity-client-id"
      (is (= (->DataSource
              "jdbc:postgresql://metabase"
              {"user" "cam"
               "azure-managed-identity-client-id" "client ID"})
             (mdb.data-source/raw-connection-string->DataSource "postgres://metabase" "cam" nil "client ID")
             (mdb.data-source/raw-connection-string->DataSource "postgres://metabase" "cam" "" "client ID"))))
    (testing "password only"
      (is (= (->DataSource
              "jdbc:postgresql://metabase"
              {"password" "1234"})
             (mdb.data-source/raw-connection-string->DataSource "postgres://metabase" nil "1234" nil)
             (mdb.data-source/raw-connection-string->DataSource "postgres://metabase" "" "1234" nil)
             (mdb.data-source/raw-connection-string->DataSource "postgres://metabase" "" "1234" "client ID"))))))

(deftest ^:parallel equality-test
  (testing "Two DataSources with the same URL should be equal"
    (is (= (mdb.data-source/raw-connection-string->DataSource "ABCD")
           (mdb.data-source/raw-connection-string->DataSource "ABCD"))))

  (testing "Two DataSources with the same URL and properties should be equal"
    (is (= (mdb.data-source/broken-out-details->DataSource :h2 {:db "wow", :x 1})
           (mdb.data-source/broken-out-details->DataSource :h2 {:db "wow", :x 1})))))

(deftest ^:parallel ensure-azure-managed-identity-password-test
  (testing "nothing happens if ensure-azure-managed-identity-client-id is missing"
    (let [props (Properties.)]
      (is (empty? (#'mdb.data-source/ensure-azure-managed-identity-password props)))
      (is (empty? props))))
  (testing "password is set if it's missing"
    (let [now 0
          expiry-secs 1000
          expiry (+ now (* (- expiry-secs auth-provider/azure-auth-token-renew-slack-seconds) 1000))
          props (doto (Properties.)
                  (.setProperty "azure-managed-identity-client-id" "client ID"))]
      (binding [auth-provider/*fetch-as-json* (fn [_url _headers]
                                                {:access_token "access token"
                                                 :expires_in (str expiry-secs)})
                mdb.data-source/*current-millis* (constantly now)]
        (is (= {"password" "access token"}
               (#'mdb.data-source/ensure-azure-managed-identity-password props))))
      (is (= {"azure-managed-identity-client-id" "client ID"
              "password" "access token"
              "password-expiry-timestamp" expiry}
             props))))
  (testing "nothing happens if a fresh enough password is present"
    (let [now 0
          expiry-secs 1000
          expiry (+ now (* (- expiry-secs auth-provider/azure-auth-token-renew-slack-seconds) 1000))
          props (doto (Properties.)
                  (.putAll {"azure-managed-identity-client-id" "client ID"
                            "password" "access token"
                            "password-expiry-timestamp" expiry}))]
      (binding [auth-provider/*fetch-as-json* (fn [_url _headers]
                                                (is false "should not get called"))
                mdb.data-source/*current-millis* (constantly now)]
        (is (= {"password" "access token"}
               (#'mdb.data-source/ensure-azure-managed-identity-password props))))
      (is (= {"azure-managed-identity-client-id" "client ID"
              "password" "access token"
              "password-expiry-timestamp" expiry}
             props))))
  (testing "a new password is set if the old one is stale"
    (let [now 0
          expiry-secs 1000
          expiry (+ now (* (- expiry-secs auth-provider/azure-auth-token-renew-slack-seconds) 1000))
          props (doto (Properties.)
                  (.putAll {"azure-managed-identity-client-id" "client ID"
                            "password" "access token"
                            "password-expiry-timestamp" 0}))]
      (binding [auth-provider/*fetch-as-json* (fn [_url _headers]
                                                {:access_token "new access token"
                                                 :expires_in (str expiry-secs)})
                mdb.data-source/*current-millis* (constantly now)]
        (is (= {"password" "new access token"}
               (#'mdb.data-source/ensure-azure-managed-identity-password props))))
      (is (= {"azure-managed-identity-client-id" "client ID"
              "password" "new access token"
              "password-expiry-timestamp" expiry}
             props)))))
