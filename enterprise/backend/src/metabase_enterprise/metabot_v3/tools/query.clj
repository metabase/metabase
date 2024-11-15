(ns metabase-enterprise.metabot-v3.tools.query
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.types.isa :as lib.types.isa]))

(defn column-id
  "Column id."
  [column]
  (or (:lib/desired-column-alias column)
      (:name column)))

(defn column-info
  "Column id, name, type."
  [query column]
  {:id (column-id column)
   :name (-> (lib/display-info query column) :long-display-name)
   :type (cond
           (lib.types.isa/boolean? column) :boolean
           (lib.types.isa/date-or-datetime? column) :date
           (lib.types.isa/numeric? column) :number
           (lib.types.isa/string-or-string-like? column) :string
           :else :unknown)})

(defn operator-name
  "Operator name."
  [operator]
  (-> operator :short name))

(defn source-query
  "Query that metabot works with."
  [dataset-query]
  (-> (lib.metadata.jvm/application-database-metadata-provider (:database dataset-query))
      (lib/query dataset-query)))
