(ns metabase.driver.sync.fingerprint.interface
  (:require [metabase.driver :as driver]))

(defmulti ^:private fingerprint-table!
  "Fingerprints a table and inserts field values into the app DB.

  NOTE TO DRIVER AUTHORS: you probably do not need to implement this method."
  {:arglists '([driver table fields]), :style/indent 1}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)
