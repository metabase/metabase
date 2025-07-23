(ns metabase-enterprise.legos.actions
  (:require
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase.driver :as driver]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(defn- dispatch-execute [& [lego]]
  (keyword (:lego lego)))

(defmulti execute!
  "Execute a lego description."
  {:added "0.55.0" :arglists '([lego])}
  #'dispatch-execute)

(defmethod execute! :default
  [lego]
  (throw (ex-info (str "legos.actions/execute! is not implemented for " (:lego lego))
                  {:lego lego})))

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
    (transforms.execute/execute
     {:db database
      :driver driver
      :sql query
      :output-table (qualified-table-name driver schema table)
      :overwrite? true})))

(mr/def ::transfer
  [:map
   [:lego [:= "transfer"]]
   [:source_database :int]
   [:destination_database :int]
   [:source_table :string]
   [:destination_table :string]])

(defmethod execute! :transfer
  [{:keys [source_database destination_database
           source_table destination_table]}]
  (let [{driver :engine :as database} (t2/select-one :model/Database source_database)]
    ;; do the right thing 👍 🕶️
    ))

(mr/def ::plan
  [:map
   [:steps [:+ ::lego]]])

(defn execute-plan!
  "Execute an entire plan."
  [plan]
  (doseq [step (:steps plan)]
    (execute! step)))
