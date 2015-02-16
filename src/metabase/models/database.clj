(ns metabase.models.database
  (:require [clojure.set :refer [rename-keys]]
            [clojure.string :as s]
            [korma.core :refer :all]
            [swiss.arrows :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer [realize-json]]
                             [database :refer [Database]]
                             [org :refer [Org]])
            [metabase.util :refer :all]))

(defentity Database
  (table :metabase_database))

(defn- connection-details
  "Return a map of connection details (in format usable by korma) for DATABASE."
  [database]
  (let [details (-<>> database :details :conn_str             ; get conn str like "password=corvus user=corvus ..."
                      (s/split <> #" ")                       ; split into k=v pairs
                      (map (fn [pair]                          ; convert to {:k v} pairs
                             (let [[k v] (s/split pair #"=")]
                               {(keyword k) v})))
                      (reduce conj {}))                       ; combine into single dict
        {:keys [host dbname port host]} details]
    (-> details
        (assoc :host (keyword host)                           ; convert host (e.g. 'postgres') to kw
               :port (Integer/parseInt port))                 ; convert :port to an Integer
        (rename-keys {:host :db-type
                      :dbname :db}))))

(defn- connection
  "Return a korma connection to DATABASE."
  [database]
  (let [{:keys [db-type] :as details} (-> @(:connection-details database)
                                          (assoc :host "localhost"     ; while we are still ghetto and connecting thru the docker DB fake our settings
                                                 :port 15432))
        korma-driver (->> db-type name (str "korma.db/") symbol eval)] ; e.g. korma.db/postgres
    (-> details
        (dissoc :db-type)
        korma-driver)))

(defn- native-query
  "Perform a native (i.e. SQL) query against DATABASE.
   ex. `(let [db (sel :one Database :name \"spotguides\")]
          ((:native-query db) \"SELECT COUNT(*) FROM main_guide;\"))`"
  ([database native-query]
   (native-query database native-query true))
  ([database native-query return-results?]
   (exec-raw @(:connection database) native-query (when return-results? :results))))

(defmethod post-select Database [_ {:keys [organization_id] :as db}]
  (-> db
      (realize-json :details) ; TODO wouldn't we want to actually strip this info instead of returning it?
      (assoc* :organization (sel-fn :one Org :id organization_id)
              :connection-details (delay (connection-details <>))
              :connection (delay (connection <>))
              :native-query (partial native-query <>))))

(defn databases-for-org
  "Selects the ID and NAME for all databases available to the given org-id."
  [org-id]
  (when-let [org (sel :one Org :id org-id)]
    (if (:inherits org)
      ;; inheriting orgs see ALL databases
      (sel :many [Database :id :name] (order :name :ASC))
      ;; otherwise filter by org-id
      (sel :many [Database :id :name] :organization_id org-id (order :name :ASC)))))
