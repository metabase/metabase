(ns metabase-enterprise.legos.actions
  (:require
   [clojure.edn :as edn]
   [metabase-enterprise.transforms.core :as transforms]
   [metabase.driver :as driver]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(defn- dispatch-execute [& [lego]]
  (keyword (:lego lego)))

(defmulti execute!
  "Execute a lego description."
  {:added "0.55.0" :arglists '([lego])}
  #'dispatch-execute)

(defmulti hydrate
  "Hydrate a lego description with a file."
  {:added "0.55.0" :arglists '([lego])}
  #'dispatch-execute)

(defmethod execute! :default
  [lego]
  (throw (ex-info (str "legos.actions/execute! is not implemented for " (:lego lego))
                  {:lego lego})))

(defmethod hydrate :default
  [lego]
  lego)

(mr/def ::lego
  [:map
   [:lego :string]])

(mr/def ::transform
  [:map
   [:lego [:= "transform"]]
   [:database :int]
   [:schema {:optional true} :string]
   [:table :string]
   [:query :string]])

(defn- qualified-table-name
  [driver schema table]
  (cond->> (driver/escape-alias driver table)
    (string? schema) (str (driver/escape-alias driver schema) ".")))

(defmethod execute! :transform
  [{:keys [database schema table query]}]
  (let [{driver :engine} (t2/select-one :model/Database database)]
    (transforms/execute!
     {:db-ref database
      :driver driver
      :sql query
      :output-table (qualified-table-name driver schema table)
      :overwrite? true}))
  :ok)

(defmethod hydrate :transform
  [lego]
  (update lego :query slurp))

(mr/def ::plan
  [:map
   [:steps [:+ ::lego]]])

(defn execute-plan!
  "Execute an entire plan."
  [plan]
  (println "Executing a plan.")
  (doseq [step (:steps plan)]
    (println "Executing" (:lego step))
    (execute! step))
  (println "Done!")
  :ok)

(defn hydrate-plan
  "Hydrate a plan."
  [plan]
  (assoc plan :steps (mapv hydrate (:steps plan))))

(defn hippie-parse
  "Do a very hippie style parsing of the data."
  [data-string]
  (try
    (yaml/parse-string data-string)
    (catch Exception e-yaml
      (try
        (json/decode data-string keyword)
        (catch Exception e-json
          (try
            (edn/read-string data-string)
            (catch Exception e-edn
              (throw (ex-info "Cannot parse as yaml, json, or edn. Failing."
                              {:data-string data-string
                               :yaml-error e-yaml
                               :json-error e-json
                               :edn-error  e-edn})))))))))
