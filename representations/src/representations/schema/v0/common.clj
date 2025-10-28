(ns representations.schema.v0.common
  (:require
   [representations.util.malli.common :as mc]
   [representations.util.malli.registry :as mr]))

(mr/def ::name
  [:and
   {:description "Human-readable name"}
   ::mc/non-blank-string])

(mr/def ::description
  [:and
   {:description "Documentation explaining the purpose"}
   [:or :nil :string]])

(mr/def ::query
  [:and
   {:description "Native SQL query"}
   ::mc/non-blank-string])

(mr/def ::mbql-query
  [:and
   {:description "MBQL (Metabase Query Language) query"}
   any?])

(mr/def ::lib-query
  [:and
   {:description "MBQL5 query to execute"}
   any?])

(mr/def ::database
  [:and
   {:description "Database reference string"}
   ::mc/non-blank-string])

(mr/def ::collection
  [:and
   {:description "Optional collection path for organizing"}
   any?])
