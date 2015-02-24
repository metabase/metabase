(ns metabase.driver.h2.connection
  (:require [korma.db]
            [metabase.driver.connection :refer :all]))

(defmethod connection-details :h2 [{:keys [details]}]
  (clojure.set/rename-keys details {:conn_str :db}))

(defmethod connection :h2 [{:keys [connection-details]}]
  (korma.db/h2 @connection-details))
