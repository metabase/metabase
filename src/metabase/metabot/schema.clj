(ns metabase.metabot.schema
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]))

(mr/def ::role
  [:enum
   {:encode/api-request u/->snake_case_en
    :decode/api-response keyword}
   :system :user :assistant :tool])

(mr/def ::message
  [:map
   [:role                          ::role]
   [:content    {:optional true}   [:maybe :string]]
   [:tool_calls {:optional true}   [:maybe [:vector [:map
                                                     [:id :string]
                                                     [:name :string]
                                                     [:arguments :string]]]]]
   [:tool_call_id {:optional true} [:maybe :string]]])

(mr/def ::messages
  [:sequential ::message])

(mr/def ::state-map-key
  "A dynamic state-map key, normalized to its canonical string representation."
  [:or {:decode/normalize lib.schema.common/normalize-string-key}
   :string
   :keyword])

(defn- canonicalize-query
  "Return `query` as a canonical MBQL 5 query, repairing the string-valued enums a JSON
  round-trip leaves behind (e.g. `:lib/type \"mbql/query\"`). Accepts legacy or pMBQL;
  returns `query` unchanged when it is not a type-tagged query map or when normalization
  fails, so bad stored data can never break a reader."
  [query]
  (or (when (and (map? query)
                 (or (:lib/type query) (:type query)))
        (try
          (not-empty (lib-be/normalize-query query))
          (catch Exception _ nil)))
      query))

(mr/def ::query
  "An MBQL query embedded in state, restored to canonical MBQL 5 on decode."
  [:map {:decode/normalize canonicalize-query}])

(mr/def ::chart-config
  [:map [:query {:optional true} [:maybe ::query]]])

(mr/def ::chart
  [:map
   [:queries {:optional true} [:maybe [:sequential [:maybe ::query]]]]
   [:chart_config {:optional true} [:maybe ::chart-config]]])

(mr/def ::transform
  [:map [:source {:optional true} [:maybe [:map [:query {:optional true} [:maybe ::query]]]]]])

(mr/def ::state
  [:map
   [:queries {:optional true} [:map-of ::state-map-key ::query]]
   [:charts {:optional true} [:map-of ::state-map-key ::chart]]
   [:chart-configs {:optional true} [:map-of ::state-map-key ::chart-config]]
   [:todos {:optional true} [:sequential :map]]
   [:transforms {:optional true} [:map-of ::state-map-key ::transform]]
   [:link-registry {:optional true} [:map-of ::state-map-key :string]]])

(defn normalize-state
  "Normalize a state map according to [[::state]]: dynamic keys to their canonical string
  form, and every embedded MBQL query back to canonical MBQL 5. Apply this wherever
  persisted state re-enters the process, so readers can assume canonical queries."
  [state]
  (mc/decode ::state state (mtx/transformer {:name :normalize})))
