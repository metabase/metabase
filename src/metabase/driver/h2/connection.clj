(ns metabase.driver.h2.connection
  (:require korma.db
            [metabase.driver :refer [can-connect? connection connection-details]]
            [metabase.driver.generic-sql.connection :as generic]))

(defmethod connection-details :h2 [{:keys [details]}]
  (clojure.set/rename-keys details {:conn_str :db}))

(defmethod connection :h2 [database]
  (korma.db/h2 (connection-details database)))

(defmethod can-connect? :h2 [database]
  (generic/can-connect? database))
