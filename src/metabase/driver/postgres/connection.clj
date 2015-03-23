(ns metabase.driver.postgres.connection
  (:require [clojure.set :refer [rename-keys]]
            [clojure.string :as s]
            [korma.db]
            [swiss.arrows :refer :all]
            [metabase.config :as config]
            [metabase.driver :refer [connection connection-details]]))

(defmethod connection-details :postgres [database]
  (let [details (-<>> database :details :conn_str             ; get conn str like "password=corvus user=corvus ..."
                      (s/split <> #" ")                       ; split into k=v pairs
                      (map (fn [pair]                          ; convert to {:k v} pairs
                             (let [[k v] (s/split pair #"=")]
                               {(keyword k) v})))
                      (reduce conj {}))                       ; combine into single dict
        {:keys [host dbname port host]} details]
    (-> details
        (assoc :host host                                     ; e.g. "localhost"
               :make-pool? false
               :db-type :postgres                             ; HACK hardcoded to postgres for time being until API has a way to choose DB type !
               :port (Integer/parseInt port))                 ; convert :port to an Integer
        (cond-> (config/config-bool :mb-postgres-ssl) (assoc :ssl true :sslfactory "org.postgresql.ssl.NonValidatingFactory"))
        (rename-keys {:dbname :db}))))

(defmethod connection :postgres [database]
  (-> (connection-details database)
      (dissoc :db-type)
      korma.db/postgres))
