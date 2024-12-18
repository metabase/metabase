(ns metabase-enterprise.metabot-v3.tools.interface
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
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

(defmulti ^:dynamic *tool-applicable?*
  "Whether or not the current tool can possibly be applicable and passed to the AI Proxy. For example, an `invite-user`
  tool cannot be applicable if the current user does not have user invite permissions. We should error on the side of
  letting the LLM decide whether a tool is appropriate or not in cases where y
  it's in any way ambiguous -- we should
  not be parsing the message string or making these sorts of decisions ourselves."
  {:arglists '([tool-name context])}
  (fn [tool-name _context]
    (keyword tool-name)))

(defmethod *tool-applicable?* :default
  [_tool-name _context]
  true)

(defmulti ^:dynamic *invoke-tool*
  "Invoke a Metabot v3 tool, e.g. send an email to someone. This should return a map with the following keys:
  - `output`, the string value to return to the LLM
  - `reactions`, a vector of frontend reactions with a shape like
    [{:type    :reaction/display-message
      :message \"I need more info.\"}]

  `reactions` is optional - in general, we let the LLM react instead. For example, when inviting a user, we tell the
  LLM the user was invited and let it generate the message to send to the user rather than hardcoding anything.

  Different reactions should get bundled with different keys, for example `:metabot.reaction/message` should include
  `:message`. This should match what the frontend expects."
  {:arglists '([tool-name argument-map context full-history])}
  (fn [tool-name _argument-map _env]
    (keyword tool-name)))

(mu/defmethod *invoke-tool* :default
  [tool-name _argument-map _env]
  {:output (format "Tool '%s' is not yet implemented." tool-name)})
