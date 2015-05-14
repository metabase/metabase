(ns metabase.db.migrate-details
  (:require [clojure.pprint :refer [pprint]]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.db :refer :all]
            (metabase.driver [postgres :as postgres])
            [metabase.models.database :refer :all]))

;; # Convert old-style DB connection details to new-style ones

(def ^:private ^:const is-legacy-connection-details?
  {:postgres postgres/is-legacy-conn-details?
   :h2       (fn [details]
               (not (:db details)))
   :mongo    (fn [details]
               (not (:dbname details)))})

(def ^:private ^:const convert-legacy-connection-details
  {:postgres (fn [details]
               (merge details) (postgres/parse-legacy-conn-str (:conn_str details)))
   :h2       (fn [details]
               (assoc details :db (:conn_str details)))
   :mongo    (fn [details]
               (let [[_ user pass host port dbname] (re-matches #"^mongodb:\/\/(?:([^@:]+)(?::([^@:]+))?@)?([^\/:@]+)(?::([\d]+))?\/([^\/]+)$" (:conn_str details))]
                 (m/filter-vals identity (assoc details
                                                :user     user
                                                :pass     pass
                                                :host     host
                                                :port     (when port
                                                            (Integer/parseInt port))
                                                :dbname   dbname))))})

(defn convert-details-when-legacy
  "When DETAILS are legacy, return updated map, otherwise return `nil`."
  [engine details]
  {:pre [(keyword? engine)
         (map? details)]}
  (when ((is-legacy-connection-details? engine) details)
    ((convert-legacy-connection-details engine) details)))


(defn convert-legacy-database-connection-details
  "Convert the connection `details` of databases in the DB to [backwards-compatible] new-style ones when applicable."
  []
  (doseq [{:keys [id details engine]} (sel :many :fields [Database :id :details :engine])]
    (when-let [updated-details (convert-details-when-legacy engine details)]
      (log/info (format "Database %d (%s) has legacy connection details: " id engine)
                (with-out-str (clojure.pprint/pprint details))
                "Updated these to: "
                (with-out-str (clojure.pprint/pprint updated-details)))
      (upd Database id :details updated-details))))
