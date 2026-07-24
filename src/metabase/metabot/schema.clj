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
  "Repair the string-valued enums a JSON round-trip leaves behind (`:lib/type \"mbql/query\"`).
  Falls back to `query` unchanged so bad stored data can't break a reader."
  [query]
  (or (when (and (map? query)
                 (or (:lib/type query) (:type query)))
        (try
          (not-empty (lib-be/normalize-query query))
          (catch Exception _ nil)))
      query))

(mr/def ::query
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
  "Normalize a state map according to [[::state]]: dynamic keys to strings, embedded MBQL to MBQL 5."
  [state]
  (mc/decode ::state state (mtx/transformer {:name :normalize})))

(defn normalize-transform
  "Normalize a transform according to [[::transform]]."
  [transform]
  (mc/decode ::transform transform (mtx/transformer {:name :normalize})))
