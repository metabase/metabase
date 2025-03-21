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
   :keyword])

(mr/def ::metadata.parameter
  [:and
   [:map
    [:type {:optional true} [:or
                             ::metadata.parameter.type
                             [:set ::metadata.parameter.type]]]
    [:anyOf {:optional true} [:sequential [:ref ::metadata.parameter]]]
    [:description {:optional true} [:maybe ::lib.schema.common/non-blank-string]]]
   [:fn
    {:error/message "metadata.parameter must specify either `:type`` or `:anyOf`, but not both."}
    (fn [query]
      (= (count (select-keys query [:type :anyOf])) 1))]])

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
