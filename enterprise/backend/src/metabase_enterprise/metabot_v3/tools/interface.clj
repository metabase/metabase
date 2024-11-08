(ns metabase-enterprise.metabot-v3.tools.interface
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::metadata.parameter.type
  :keyword)

(mr/def ::metadata.parameter.name
  [:and
   {:decode/metadata-file (fn [x]
                            (keyword (u/->kebab-case-en x)))
    :encode/api-request   (fn [x]
                            (u/->snake_case_en (name x)))
    :decode/api-response  (fn [x]
                            (keyword (u/->kebab-case-en x)))}
   :keyword
   [:fn
    {:error/message "PARSED parameter names should be kebab-case (in JSON files they should use camelCase)"}
    #(= (u/->kebab-case-en %) %)]])

(mr/def ::metadata.parameter
  [:map
   [:type [:or
           ::metadata.parameter.type
           [:set ::metadata.parameter.type]]]
   [:description {:optional true} [:maybe ::lib.schema.common/non-blank-string]]])

(mr/def ::metadata.parameters.properties
  [:map-of ::metadata.parameter.name ::metadata.parameter])

(mr/def ::metadata.parameters
  [:map
   {:decode/metadata-file #(update-keys % (comp keyword u/->kebab-case-en))
    :decode/api-response  #(update-keys % (comp keyword u/->kebab-case-en))
    :encode/api-request   #(update-keys % u/->camelCaseEn)}
   [:type                  [:= {:decode/metadata-file keyword} :object]]
   [:properties            ::metadata.parameters.properties]
   [:required              {:optional true, :default []} [:sequential ::metadata.parameter.name]]
   [:additional-properties {:optional true, :default false} :boolean]])

(mr/def ::metadata.name
  [:and
   {:encode/api-request   (fn [x]
                            (u/->snake_case_en (name x)))
    :decode/metadata-file (fn [x]
                            (let [kw (keyword x)]
                              (if (namespace kw)
                                kw
                                (keyword "metabot.tool" (name kw)))))
    :decode/api-request   (fn [x]
                            (let [kw (keyword x)]
                              (if (namespace kw)
                                kw
                                (keyword "metabot.tool" (name kw)))))
    :decode/api-response  (fn [x]
                            (keyword "metabot.tool" (name (u/->kebab-case-en x))))}
   :keyword
   [:fn
    {:error/message "Tool names should be kebab-case (both parsed and in YAML files)"}
    #(= (u/->kebab-case-en %) %)]])

(mr/def ::metadata
  [:map
   [:name        ::metadata.name]
   [:description ::lib.schema.common/non-blank-string]
   [:parameters  ::metadata.parameters]])
