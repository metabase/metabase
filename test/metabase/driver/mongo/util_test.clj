(ns metabase.driver.mongo.util-test
  (:require [expectations :refer :all]
            [metabase.driver :as driver]
            [metabase.test.util :as tu])
  (:import com.mongodb.ReadPreference))

(tu/resolve-private-vars metabase.driver.mongo.util build-connection-options)

;; test that people can specify additional connection options like `?readPreference=nearest`
(expect
  (ReadPreference/nearest)
  (.getReadPreference (build-connection-options :additional-options "readPreference=nearest")))

(expect
  (ReadPreference/secondaryPreferred)
  (.getReadPreference (build-connection-options :additional-options "readPreference=secondaryPreferred")))

;; make sure we can specify multiple options
(expect
  "test"
  (.getRequiredReplicaSetName (build-connection-options :additional-options "readPreference=secondary&replicaSet=test")))

(expect
  (ReadPreference/secondary)
  (.getReadPreference (build-connection-options :additional-options "readPreference=secondary&replicaSet=test")))

;; make sure that invalid additional options throw an Exception
(expect
  IllegalArgumentException
  (build-connection-options :additional-options "readPreference=ternary"))

(expect
  #"We couldn't connect to the ssh tunnel host"
  (try
    (let [engine :mongo
      details {:ssl false,
               :password "changeme",
               :tunnel-host "localhost",
               :tunnel-pass "BOGUS-BOGUS",
               :port 5432,
               :dbname "test",
               :host "localhost",
               :tunnel-enabled true,
               :tunnel-port 22,
               :tunnel-user "bogus"}]
      (driver/can-connect-with-details? engine details :rethrow-exceptions))
       (catch Exception e
         (.getMessage e))))
