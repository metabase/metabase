(ns metabase.driver.mongo.util-test
  (:require [clojure.test :refer :all]
            [expectations :refer [expect]]
            [metabase.driver.mongo.util :as mongo-util]
            [metabase.driver.util :as driver.u]
            [metabase.test :as mt]
            [metabase.test.util.log :as tu.log])
  (:import [com.mongodb DB MongoClient MongoClientException ReadPreference ServerAddress]))

(defn- connect-mongo [opts]
  (let [connection-info (#'mongo-util/details->mongo-connection-info
                          (#'mongo-util/normalize-details
                            opts))]
    (#'mongo-util/connect connection-info)))

(def connect-passthrough
  (fn [{map-type :type}]
    map-type))

(def srv-passthrough
  (fn [_] {:type :srv}))


;; test hostname is fqdn

(expect
  true
  (#'mongo-util/fqdn? "db.mongo.com"))

(expect
  true
  (#'mongo-util/fqdn? "replica-01.db.mongo.com"))

(expect
  false
  (#'mongo-util/fqdn? "localhost"))

(expect
  false
  (#'mongo-util/fqdn? "localhost.localdomain"))


;; test srv connection string

(expect
  "mongodb+srv://test-user:test-pass@test-host.place.com/authdb"
  (#'mongo-util/srv-conn-str "test-user" "test-pass" "test-host.place.com" "authdb"))


;; test that srv toggle works

(expect
  :srv
  (with-redefs [mongo-util/srv-connection-info srv-passthrough
                mongo-util/connect connect-passthrough]
    (let [host "my.fake.domain"
          opts {:host               host
                :port               1015
                :user               "test-user"
                :authdb             "test-authdb"
                :pass               "test-passwd"
                :dbname             "test-dbname"
                :ssl                true
                :additional-options ""
                :use-srv            true}]
      (connect-mongo opts))))

(expect
  :normal
  (with-redefs [mongo-util/connect connect-passthrough]
    (let [host "localhost"
          opts {:host               host
                :port               1010
                :user               "test-user"
                :authdb             "test-authdb"
                :pass               "test-passwd"
                :dbname             "test-dbname"
                :ssl                true
                :additional-options ""
                :use-srv            false}]
      (connect-mongo opts))))

(expect
  :normal
  (with-redefs [mongo-util/connect connect-passthrough]
    (let [host "localhost.domain"
          opts {:host               host
                :port               1010
                :user               "test-user"
                :authdb             "test-authdb"
                :pass               "test-passwd"
                :dbname             "test-dbname"
                :ssl                true
                :additional-options ""}]
      (connect-mongo opts))))

;; test that connection properties when using srv

(expect
  "No SRV record available for host fake.fqdn.com"
  (try
    (let [host "fake.fqdn.com"
          opts {:host               host
                :port               1015
                :user               "test-user"
                :authdb             "test-authdb"
                :pass               "test-passwd"
                :dbname             "test-dbname"
                :ssl                true
                :additional-options ""
                :use-srv            true}
          [^MongoClient mongo-client ^DB db] (connect-mongo opts)
          ^ServerAddress mongo-addr (-> mongo-client
                                        (.getAllAddress)
                                        first)
          mongo-host (-> mongo-addr .getHost)
          mongo-port (-> mongo-addr .getPort)]
      [mongo-host mongo-port])
    (catch MongoClientException e
      (.getMessage e))))

(expect
  "Using DNS SRV requires a FQDN for host"
  (try
    (let [host "host1"
          opts {:host               host
                :port               1015
                :user               "test-user"
                :authdb             "test-authdb"
                :pass               "test-passwd"
                :dbname             "test-dbname"
                :ssl                true
                :additional-options ""
                :use-srv            true}
          [^MongoClient mongo-client ^DB db] (connect-mongo opts)
          ^ServerAddress mongo-addr (-> mongo-client
                                        (.getAllAddress)
                                        first)
          mongo-host (-> mongo-addr .getHost)
          mongo-port (-> mongo-addr .getPort)]
      [mongo-host mongo-port])
    (catch Exception e
      (.getMessage e))))

(expect
  "Unable to look up SRV record for host fake.fqdn.org"
  (try
    (let [host "fake.fqdn.org"
          opts {:host               host
                :port               1015
                :user               "test-user"
                :authdb             "test-authdb"
                :pass               "test-passwd"
                :dbname             "test-dbname"
                :ssl                true
                :additional-options ""
                :use-srv            true}
          [^MongoClient mongo-client ^DB db] (connect-mongo opts)
          ^ServerAddress mongo-addr (-> mongo-client
                                        (.getAllAddress)
                                        first)
          mongo-host (-> mongo-addr .getHost)
          mongo-port (-> mongo-addr .getPort)]
      [mongo-host mongo-port])
    (catch MongoClientException e
      (.getMessage e))))

;; test host and port are correct for both srv and normal

(expect
  ["localhost" 1010]
  (let [host "localhost"
        opts {:host               host
              :port               1010
              :user               "test-user"
              :authdb             "test-authdb"
              :pass               "test-passwd"
              :dbname             "test-dbname"
              :ssl                true
              :additional-options ""}
        [^MongoClient mongo-client ^DB db] (connect-mongo opts)
        ^ServerAddress mongo-addr (-> mongo-client
                                      (.getAllAddress)
                                      first)
        mongo-host (-> mongo-addr .getHost)
        mongo-port (-> mongo-addr .getPort)]
    [mongo-host mongo-port]))


;; test that people can specify additional connection options like `?readPreference=nearest`
(expect
  (ReadPreference/nearest)
  (.getReadPreference (-> (#'mongo-util/connection-options-builder :additional-options "readPreference=nearest")
                          .build)))

(expect
  (ReadPreference/secondaryPreferred)
  (.getReadPreference (-> (#'mongo-util/connection-options-builder :additional-options "readPreference=secondaryPreferred")
                          .build)))

;; make sure we can specify multiple options
(expect
  "test"
  (.getRequiredReplicaSetName (-> (#'mongo-util/connection-options-builder :additional-options "readPreference=secondary&replicaSet=test")
                                  .build)))

(expect
  (ReadPreference/secondary)
  (.getReadPreference (-> (#'mongo-util/connection-options-builder :additional-options "readPreference=secondary&replicaSet=test")
                          .build)))

;; make sure that invalid additional options throw an Exception
(expect
  IllegalArgumentException
  (-> (#'mongo-util/connection-options-builder :additional-options "readPreference=ternary")
      .build))

(deftest test-ssh-connection
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
               (tu.log/suppress-output
                 (driver.u/can-connect-with-details? engine details :throw-exceptions)))
             (catch Throwable e
               (loop [^Throwable e e]
                 (or (when (instance? java.net.ConnectException e)
                       (throw e))
                     (some-> (.getCause e) recur))))))))))
