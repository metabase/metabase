(ns metabase.driver.mongo.util-test
  (:require [expectations :refer [expect]]
            [metabase.driver.mongo.util :as mongo-util]
            [metabase.driver.util :as driver.u]
            [metabase.test.util.log :as tu.log])
  (:import com.mongodb.ReadPreference))

;; test that people can specify additional connection options like `?readPreference=nearest`
(expect
  (ReadPreference/nearest)
  (.getReadPreference (#'mongo-util/build-connection-options :additional-options "readPreference=nearest")))

(expect
  (ReadPreference/secondaryPreferred)
  (.getReadPreference (#'mongo-util/build-connection-options :additional-options "readPreference=secondaryPreferred")))

;; make sure we can specify multiple options
(expect
  "test"
  (.getRequiredReplicaSetName (#'mongo-util/build-connection-options :additional-options "readPreference=secondary&replicaSet=test")))

(expect
  (ReadPreference/secondary)
  (.getReadPreference (#'mongo-util/build-connection-options :additional-options "readPreference=secondary&replicaSet=test")))

;; make sure that invalid additional options throw an Exception
(expect
  IllegalArgumentException
  (#'mongo-util/build-connection-options :additional-options "readPreference=ternary"))

(expect
  #"We couldn't connect to the ssh tunnel host"
  (try
    (let [engine  :mongo
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
