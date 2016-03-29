(ns metabase.driver.crate
  (:require [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            [clojure.string :as s])
  (:import (clojure.lang Named)))

(defrecord CrateDriver []
  Named
  (getName [_] "Crate"))


(defn- crate-spec
  [{:keys [host port]
    :or {host "localhost", port 4300}
    :as opts}]
  (merge {:classname "io.crate.client.jdbc.CrateDriver" ; must be in classpath
          :subprotocol "crate"
          :subname (str "//" host ":" port)}
         (dissoc opts :host :port)))

(defn- connection-details->spec [_ details]
  (-> details crate-spec))

(def CrateISQLDriverMixin
  "Implementations of `ISQLDriver` methods for `PostgresDriver`."
  (merge (sql/ISQLDriverDefaultsMixin)
         {:connection-details->spec  connection-details->spec}))

(extend CrateDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:details-fields (constantly [{:name         "host"
                                        :display-name "Host"
                                        :default      "localhost"}
                                       {:name         "port"
                                        :display-name "Port"
                                        :type         :integer
                                        :default      4300}])
          })
  sql/ISQLDriver CrateISQLDriverMixin)

(driver/register-driver! :crate (CrateDriver.))
