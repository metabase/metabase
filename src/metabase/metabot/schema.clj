(ns metabase.metabot.schema
  (:require [malli.core :as mc]))

(def clause-schema
  "Specification for a field clause
  (e.g. [:field \"TITLE\" {:base-type \"type/Text\"}])"
  (mc/schema
    [:tuple
     [:enum :field]
     string?
     [:map [:base-type string?]]]))

(def context-schema
  (mc/schema
    [:sequential
     [:map
      [:table_name string?]
      [:table_id integer?]
      [:fields
       [:sequential
        [:map
         [:clause clause-schema]
         [:field_name string?]
         [:field_type [:or
                       keyword?
                       string?]]]]]]]))

(def field-ref-schema
  "Specification for a field ref"
  (mc/schema
    [:tuple
     [:enum :field]
     [:or :string :int]
     [:maybe [:map]]]))

(def rsmd-schema
  (mc/schema
    [:map
     [:name :string]
     [:id {:optional true} :int]
     [:display_name :string]
     [:description {:optional true} [:maybe :string]]
     [:field_ref field-ref-schema]
     [:base_type {:optional true} [:or :string :keyword]]
     [:effective_type {:optional true} [:or :string :keyword]]]))

(def model-schema
  (mc/schema
    [:map {:closed false}
     [:name :string]
     [:id {:optional true} :int]
     [:description {:optional true} [:maybe :string]]
     [:database_id :int]
     [:result_metadata
      [:vector rsmd-schema]]]))

(def inference-schema
  "The schema used to validate LLM infer input"
  (mc/schema
    [:map
     [:user_prompt string?]
     [:model model-schema]]))

(comment
  (require '[malli.generator :as mg])
  (mg/generate inference-schema))
