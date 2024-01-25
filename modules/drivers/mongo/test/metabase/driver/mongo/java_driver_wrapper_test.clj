(ns metabase.driver.mongo.java-driver-wrapper-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.mongo.java-driver-wrapper :as mongo.jdw]
   [metabase.driver.util :as driver.u]
   [metabase.test :as mt])
  (:import
   (com.mongodb ServerAddress)
   (com.mongodb.client MongoDatabase)))

(set! *warn-on-reflection* true)

(def ^:private mock-details
  {:user "test-user"
   :pass "test-pass"
   :host "test-host.place.com"
   :dbname "datadb"
   :authdb "authdb"
   :use-srv true})

(deftest ^:parallel fqdn?-test
  (testing "test hostname is fqdn"
    (is (true? (#'mongo.jdw/fqdn? "db.mongo.com")))
    (is (true? (#'mongo.jdw/fqdn? "replica-01.db.mongo.com")))
    (is (false? (#'mongo.jdw/fqdn? "localhost")))
    (is (false? (#'mongo.jdw/fqdn? "localhost.localdomain")))))

(defn- details-normalized [details]
  (#'mongo.jdw/details-normalized details))

(deftest ^:parallel srv-conn-str-test
  (let [db-details {:user "test-user"
                    :pass "test-pass"
                    :host "test-host.place.com"
                    :dbname "datadb"
                    :authdb "authdb"
                    :use-srv true}]
    (testing "mongo+srv connection string used when :use-srv is thruthy"
      (is (re-find #"\Qmongodb+srv://test-user:test-pass@test-host.place.com/datadb?authSource=authdb\E"
                   (mongo.jdw/db-details->connection-string db-details))))
    (testing "Only fqdn may be used with mongo+srv"
      (is (thrown-with-msg? Throwable
                            #"\QUsing DNS SRV requires a FQDN for host\E"
                            (-> db-details (assoc :host "localhost")
                                details-normalized
                                mongo.jdw/db-details->connection-string))))))

;; TODO: I'm getting different exception. Why?
(deftest ^:parallel srv-connection-properties-test
  (testing "connection properties when using SRV"
    (are [host msg]
         (thrown-with-msg? Throwable msg
                           (mongo.jdw/with-mongo-database [^MongoDatabase db
                                                           {:host               host
                                                            :port               1015
                                                            :user               "test-user"
                                                            :authdb             "test-authdb"
                                                            :pass               "test-passwd"
                                                            :dbname             "test-dbname"
                                                            :ssl                true
                                                            :additional-options "connectTimeoutMS=2000&serverSelectionTimeoutMS=2000"
                                                            :use-srv            true}]
                             (mongo.jdw/list-collection-names db)))
      "db.fqdn.test" #"Failed looking up SRV record"
      "local.test" #"Using DNS SRV requires a FQDN for host")
    (testing "test host and port are correct for both srv and normal"
      (let [host                            "localhost"
            details                         {:host               host
                                             :port               1010
                                             :user               "test-user"
                                             :authdb             "test-authdb"
                                             :pass               "test-passwd"
                                             :dbname             "test-dbname"
                                             :ssl                true
                                             :additional-options ""}
            client-settings (mongo.jdw/db-details->mongo-client-settings details)
            ^ServerAddress server-address (-> client-settings .getClusterSettings .getHosts first)]
        (is (= "localhost"
               (.getHost server-address)))
        (is (= 1010
               (.getPort server-address)))))))

(deftest ^:parallel additional-connection-options-test
  (mt/test-driver
   :mongo
   (testing "test that people can specify additional connection options like `?readPreference=nearest`"
     (is (= (com.mongodb.ReadPreference/nearest)
            (-> (assoc mock-details :additional-options "readPreference=nearest")
                mongo.jdw/db-details->mongo-client-settings
                .getReadPreference)))
     (is (= (com.mongodb.ReadPreference/secondaryPreferred)
            (-> mock-details
                (assoc :additional-options "readPreference=secondaryPreferred")
                mongo.jdw/db-details->mongo-client-settings
                .getReadPreference))))
   (testing "make sure we can specify multiple options"
     (let [settings (-> mock-details
                        (assoc :additional-options "readPreference=secondary&replicaSet=test")
                        mongo.jdw/db-details->mongo-client-settings)]
       (is (= "test" 
              (-> settings .getClusterSettings .getRequiredReplicaSetName)))
       (is (= (com.mongodb.ReadPreference/secondary)
              (.getReadPreference settings)))))
   (testing "make sure that invalid additional options throw an Exception"
     (is (thrown-with-msg?
          IllegalArgumentException
          #"No match for read preference of ternary"
          (-> mock-details
              (assoc :additional-options "readPreference=ternary")
              mongo.jdw/db-details->mongo-client-settings))))))

(deftest ^:parallel test-ssh-connection
  (testing "Gets an error when it can't connect to mongo via ssh tunnel"
    (mt/test-driver
     :mongo
     (is (thrown?
          java.net.ConnectException
          (try
            (let [engine :mongo
                  details {:ssl            false
                           :password       "changeme"
                           :tunnel-host    "localhost"
                           :tunnel-pass    "BOGUS-BOGUS"
                           :port           5432
                           :dbname         "test"
                           :host           "localhost"
                           :tunnel-enabled true
                           ;; we want to use a bogus port here on purpose -
                           ;; so that locally, it gets a ConnectionRefused,
                           ;; and in CI it does too. Apache's SSHD library
                           ;; doesn't wrap every exception in an SshdException
                           :tunnel-port    21212
                           :tunnel-user    "bogus"}]
              (driver.u/can-connect-with-details? engine details :throw-exceptions))
            (catch Throwable e
              (loop [^Throwable e e]
                (or (when (instance? java.net.ConnectException e)
                      (throw e))
                    (some-> (.getCause e) recur))))))))))
