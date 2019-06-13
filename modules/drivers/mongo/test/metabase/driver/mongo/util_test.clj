(ns metabase.driver.mongo.util-test
  (:require [expectations :refer [expect]]
            [metabase.driver.mongo.util :as mongo-util]
            [metabase.driver.util :as driver.u]
            [metabase.test.util.log :as tu.log])
  (:import com.mongodb.ReadPreference
           (com.mongodb MongoClient DB Mongo ServerAddress MongoClientException)))



(defn- connect [host opts]
  (-> (#'mongo-util/connect-fn host)
      (apply [opts])))


;; test srv connection string

(expect
  "mongodb+srv://test-user:test-pass@test-host.place.com/authdb"
  (#'mongo-util/srv-conn-str "test-user" "test-pass" "test-host.place.com" "authdb"))

;; test that connect-srv is invoked for fqdn

(expect
  :mongo-srv
  (with-redefs [mongo-util/connect-srv (fn [d] :mongo-srv)]
    (let [host "my.fake.domain"
          opts {:host               host
                :port               1015
                :user               "test-user"
                :authdb             "test-authdb"
                :pass               "test-passwd"
                :dbname             "test-dbname"
                :ssl                true
                :additional-options ""}]
      (connect host opts))))

;; test that connect is invoked for non-fqdn

(expect
  :mongo-plain
  (with-redefs [mongo-util/connect (fn [d] :mongo-plain)]
    (let [host "localhost"
          opts {:host               host
                :port               1010
                :user               "test-user"
                :authdb             "test-authdb"
                :pass               "test-passwd"
                :dbname             "test-dbname"
                :ssl                true
                :additional-options ""}]
      (connect host opts))))

(expect
  :mongo-plain
  (with-redefs [mongo-util/connect (fn [d] :mongo-plain)]
    (let [host "localhost.domain"
          opts {:host               host
                :port               1010
                :user               "test-user"
                :authdb             "test-authdb"
                :pass               "test-passwd"
                :dbname             "test-dbname"
                :ssl                true
                :additional-options ""}]
      (connect host opts))))

;; test that connection attempt fails for fake hosts when using srv

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
                :additional-options ""}
          [^MongoClient mongo-client ^DB db] (connect host opts)
          ^ServerAddress mongo-addr (-> mongo-client
                                        (.getAllAddress)
                                        first)
          mongo-host (-> mongo-addr .getHost)
          mongo-port (-> mongo-addr .getPort)]
      [mongo-host mongo-port])
    (catch MongoClientException e
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
                :additional-options ""}
          [^MongoClient mongo-client ^DB db] (connect host opts)
          ^ServerAddress mongo-addr (-> mongo-client
                                        (.getAllAddress)
                                        first)
          mongo-host (-> mongo-addr .getHost)
          mongo-port (-> mongo-addr .getPort)]
      [mongo-host mongo-port])
    (catch MongoClientException e
      (.getMessage e))))

;; test host and port and correct in plain client

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
        [^MongoClient mongo-client ^DB db] (connect host opts)
        ^ServerAddress mongo-addr (-> mongo-client
                                      (.getAllAddress)
                                      first)
        mongo-host (-> mongo-addr .getHost)
        mongo-port (-> mongo-addr .getPort)]
    [mongo-host mongo-port]))

;; test that we get an ifn back when trying to connect

(expect
  true
  (let [host "localhost"
        conn-fn (#'mongo-util/connect-fn host)]
    (ifn? conn-fn)))

(expect
  true
  (let [host "fake.fqdn.org"
        conn-fn (#'mongo-util/connect-fn host)]
    (ifn? conn-fn)))

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

(expect
  #"We couldn't connect to the ssh tunnel host"
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
                   :tunnel-port    22
                   :tunnel-user    "bogus"}]
      (tu.log/suppress-output
        (driver.u/can-connect-with-details? engine details :throw-exceptions)))
    (catch Exception e
      (.getMessage e))))
