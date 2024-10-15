(ns metabase.metabot-v3.tools.interface
  (:require
   [clojure.set :as set]
   [clojure.spec.alpha :as s]
   [malli.core :as mc]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::tool.parameters.type
  [:enum :object])

(mr/def ::tool.parameters.property.name
  :keyword)

(mr/def ::tool.parameters.property.type
  [:enum :string :null])

(mr/def ::tool.parameters.property
  [:map
   [:type [:or
           ::tool.parameters.property.type
           [:set ::tool.parameters.property.type]]]
   [:description {:optional true} [:maybe ::lib.schema.common/non-blank-string]]])

(mr/def ::tool.parameters.properties
  [:map-of ::tool.parameters.property.name ::tool.parameters.property])

(mr/def ::tool.parameters
  [:map
   {:encode/api-request #(set/rename-keys % {:additional-properties :additionalProperties})}
   [:type                  ::tool.parameters.type]
   [:properties            ::tool.parameters.properties]
   [:required              [:set ::tool.parameters.property.name]]
   [:additional-properties :boolean]])

(mr/def ::tool.name
  [:schema
   {:encode/api-request (fn [x]
                          (if (keyword? x)
                            (name x)
                            x))
    :decode/api-response (fn [x]
                           (if (string? x)
                             (keyword "metabot-v3.tool" x)
                             x))}
   qualified-keyword?])

(mr/def ::tool
  [:map
   [:name        ::tool.name]
   [:description ::lib.schema.common/non-blank-string]
   [:parameters  ::tool.parameters]])

(defmulti tool-definition
  "Declare a tool for use with MetaBot v3, e.g. declare that we have a tool for sending an email to someone."
  {:arglists '([tool-name])}
  keyword)

(defmulti invoke-tool
  "Invoke a Metabot v3 tool, e.g. send an email to someone."
  {:arglists '([tool-name argument-map])}
  (fn [tool-name _argument-map]
    (keyword tool-name)))

(defmethod invoke-tool :default
  [tool-name argument-map]
  (throw (ex-info (i18n/tru "Don''t know how to invoke tool {0}" tool-name)
                  {:tool-name tool-name, :argument-map argument-map})))

(defmacro deftool
  "Define a new MetaBot tool."
  [tool-name description parameters bindings & body]
  `(let [definition# {:name        ~tool-name
                      :description ~description
                      :parameters  (merge {:type :object} ~parameters)}]
     (mc/assert ::tool definition#)
     (mu/defmethod tool-definition ~tool-name :- ::tool
       [_tool-name#]
       definition#)
     (defmethod invoke-tool ~tool-name
       [_tool-name# ~@bindings]
       ~@body)))

(s/fdef deftool
  :args (s/cat :tool-name   (and qualified-keyword?
                                 #(= (namespace %) "metabot-v3.tool"))
               :description string?
               :parameters  map?
               :bindings    (and vector?
                                 #(= (count %) 1))
               :body        (s/* any?))
  :ret  any?)
