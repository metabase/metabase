(ns metabase.driver.mongo.connection-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.config :as config]
   [metabase.driver.mongo.connection :as mongo.connection]
   [metabase.driver.mongo.database :as mongo.db]
   [metabase.driver.mongo.util :as mongo.util]
   [metabase.driver.util :as driver.u]
   [metabase.test :as mt])
  (:import
   (com.mongodb MongoCredential ServerAddress)
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
    (is (true? (#'mongo.db/fqdn? "db.mongo.com")))
    (is (true? (#'mongo.db/fqdn? "replica-01.db.mongo.com")))
    (is (false? (#'mongo.db/fqdn? "localhost")))
    (is (false? (#'mongo.db/fqdn? "localhost.localdomain")))))

(deftest ^:parallel srv-conn-str-test
  (let [db-details {:user "test-user"
                    :pass "test-pass"
                    :host "test-host.place.com"
                    :dbname "datadb"
                    :authdb "authdb"
                    :use-srv true}]
    (testing "mongo+srv connection string used when :use-srv is thruthy"
      (is (str/includes? (mongo.connection/db-details->connection-string db-details)
                         "mongodb+srv://test-host.place.com/"))
      (let [settings (mongo.connection/db-details->mongo-client-settings db-details)
            ^MongoCredential credential (.getCredential settings)]
        (is (= "test-user" (.getUserName credential)))
        (is (= "test-pass" (str/join "" (.getPassword credential))))
        (is (= "authdb" (.getSource credential)))))
    (testing "Only fqdn may be used with mongo+srv"
      (is (thrown-with-msg? Throwable
                            #"Using DNS SRV requires a FQDN for host"
                            (-> db-details
                                (assoc :host "localhost")
                                mongo.db/details-normalized
                                mongo.connection/db-details->connection-string))))))

(deftest ^:parallel srv-connection-properties-test
  (testing "connection properties when using SRV"
    (are [host msg]
         (thrown-with-msg? Throwable msg
                           (mongo.connection/with-mongo-database [^MongoDatabase db
                                                           {:host               host
                                                            :port               1015
                                                            :user               "test-user"
                                                            :authdb             "test-authdb"
                                                            :pass               "test-passwd"
                                                            :dbname             "test-dbname"
                                                            :ssl                true
                                                            :additional-options "connectTimeoutMS=2000&serverSelectionTimeoutMS=2000"
                                                            :use-srv            true}]
                             (mongo.util/list-collection-names db)))
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
            client-settings (mongo.connection/db-details->mongo-client-settings details)
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
                mongo.connection/db-details->mongo-client-settings
                .getReadPreference)))
     (is (= (com.mongodb.ReadPreference/secondaryPreferred)
            (-> mock-details
                (assoc :additional-options "readPreference=secondaryPreferred")
                mongo.connection/db-details->mongo-client-settings
                .getReadPreference))))
   (testing "make sure we can specify multiple options"
     (let [settings (-> mock-details
                        (assoc :additional-options "readPreference=secondary&replicaSet=test")
                        mongo.connection/db-details->mongo-client-settings)]
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
              mongo.connection/db-details->mongo-client-settings))))))

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

(deftest hard-password-test
  (mt/test-driver
   :mongo
   (testing "Passwords and usernames containing `$ : / ? # [ ] @` are usable (#38697)"
     (let [s "$ : / ? # [ ] @"
           settings (mongo.connection/db-details->mongo-client-settings {:user s
                                                                         :pass s
                                                                         :host "localhost"
                                                                         :dbname "justdb"})
           ^MongoCredential credential (.getCredential settings)]
       (is (= s (.getUserName credential)))
       (is (= s (str/join "" (.getPassword credential))))
       (is (= "admin" (.getSource credential)))))))

(deftest application-name-test
  (mt/test-driver
   :mongo
   (with-redefs [config/mb-app-id-string "$ : / ? # [ ] @"]
     (let [db-details {:host "test-host.place.com"
                       :dbname "datadb"}
           settings (mongo.connection/db-details->mongo-client-settings db-details)]
       (is (= "$ : / ? # [ ] @"
              (.getApplicationName settings)))))))
