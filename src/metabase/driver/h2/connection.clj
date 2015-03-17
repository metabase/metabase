(ns metabase.driver.h2.connection
  (:require [korma.db]
            [metabase.driver :refer [connection connection-details]]))

(defmethod connection-details :h2 [{:keys [details]}]
  (clojure.set/rename-keys details {:conn_str :db}))

(defmethod connection :h2 [database]
  (korma.db/h2 (connection-details database)))
