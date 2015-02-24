(ns metabase.driver.metadata
  "Metadata multi-methods. Implemented by the various drivers, e.g. `metabase.driver.postgres.metadata`."
  (:require [metabase.driver.util :as util]))

(defn- field-dispatch-fn
  "Dispatch function that keys of of `(:engine @(:db field))`."
  [{:keys [db] :as field}]
  ((util/db-dispatch-fn "metadata") @db))

(defmulti field-count
  "Return number of rows for FIELD."
  field-dispatch-fn)

(defmulti field-distinct-count
  "Return number of distinct rows for FIELD."
  field-dispatch-fn)
