(ns metabase.driver.connection
  (:require [metabase.driver.util :as util]))

(defmulti connection-details
  "Return a map of connection details (in format usable by korma) for DATABASE."
  (util/db-dispatch-fn "connection"))

(defmulti connection
  "Return a korma connection to DATABASE."
  (util/db-dispatch-fn "connection"))
