(ns representations.schema.v0.common
  (:require
   [representations.util.malli.common :as mc]
   [representations.util.malli.registry :as mr]))

(mr/def ::display-name
  [:and
   {:description "Human-readable name"}
   ::mc/non-blank-string])

(mr/def ::description
  [:and
   {:description "Documentation explaining the purpose"}
   [:or :nil :string]])

(mr/def ::query
  [:or
   {:description "Query - either a native SQL query string or MBQL/lib query map"}
   ::mc/non-blank-string
   ;; TODO: vector? map? the following represents mbql:
   :any])

(mr/def ::database
  [:and
   {:description "Database reference string"}
   ::mc/non-blank-string])

(mr/def ::collection
  [:and
   {:description "Optional collection path for organizing"}
   any?])
