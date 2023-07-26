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

(def inference-schema
  "The schema used to validate LLM infer input"
  (mc/schema
   [:map
    [:prompt string?]
    [:context context-schema]]))

(comment
  (require '[malli.generator :as mg])
  (mg/generate inference-schema))