(ns metabase.driver.mongo.util-test
  (:require [expectations :refer :all]
            metabase.driver.mongo.util
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
