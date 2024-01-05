(ns metabase.driver.mongo.execute
  (:require
   [metabase.driver.mongo.execute.session :as mongo.execute.session]
   [metabase.driver.mongo.execute.simple :as mongo.execute.simple]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]))

(defn execute-reducible-query
  "Process and run a native MongoDB query."
  [query context respond]
  (try
    (mongo.execute.session/execute-reducible-query query context respond)
    (catch com.mongodb.MongoClientException e
      (if (mongo.execute.session/session-not-supported-ex? e)
        (do (log/warn (trs "Unable to use sessions on this deployment. Query cancelation will not work."))
            (mongo.execute.simple/execute-reducible-query query context respond))
        (throw e)))))
