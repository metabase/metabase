(ns metabase.actions.schema
  (:require
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::id
  "Valid Action ID"
  pos-int?)

(def ^:private prefetch-parameter-values-message
  (deferred-tru "value must be a JSON object mapping parameter ids to scalar values."))

(defn- decode-prefetch-parameter-values
  "Parse the JSON-encoded parameter values this endpoint takes on the query string.

  Both failure modes have to be turned into a 400 here: an unparseable string throws inside Jackson, and a parsed
  non-map throws inside the `:map-of` decoder, so either would otherwise surface as a 500."
  [x]
  (let [parsed (if (string? x)
                 (try
                   (json/decode x)
                   (catch Throwable _
                     (throw (ex-info (str prefetch-parameter-values-message) {:status-code 400}))))
                 x)]
    (when-not (map? parsed)
      (throw (ex-info (str prefetch-parameter-values-message) {:status-code 400})))
    parsed))

(defn- parameter-values-schema
  "Request schema for a map of parameter id -> value.

  The strict `[:map-of key-schema value-schema]` can't be the request schema directly, because `:map-of` decoding
  silently drops entries that don't match: a rejected key or value would vanish and leave a request that validates,
  rather than a 400. Decoding therefore sees a permissive `[:map-of decoded-key-schema :any]` -- loose enough to drop
  nothing, but still typed enough to coerce the keys -- and the `:fn` re-checks the strict shape afterwards.

  A value must never be a map: these end up as bound values in a query or a written row, where a map is
  indistinguishable from HoneySQL structure."
  [{:keys [decoded-key-schema key-schema value-schema message decode]}]
  (let [strict [:map-of key-schema value-schema]]
    [:schema
     (cond-> {:description message}
       decode (assoc :decode/api decode))
     [:and
      [:map-of decoded-key-schema :any]
      [:fn {:error/fn (fn [_ _] message)}
       #(mr/validate strict %)]]]))

(mr/def ::prefetch-parameter-values
  "Values used to prefetch the row an implicit action will update or delete: parameter id -> value, JSON-encoded
  because this endpoint takes them on the query string.

  Keys stay strings, because [[metabase.actions.execution]] matches them against slugified column names. A value must
  be a single scalar: the primary key value is spliced into an MBQL `:=` filter."
  (parameter-values-schema
   {:decoded-key-schema :string
    :key-schema         [:ref ::lib.schema.parameter/id]
    :value-schema       [:ref ::lib.schema.parameter/parameter.value.scalar]
    :message            prefetch-parameter-values-message
    :decode             decode-prefetch-parameter-values}))

(def ^:private execute-parameter-values-message
  (deferred-tru "value must map parameter ids to scalar values."))

(mr/def ::execute-parameter-values
  "Values supplied when executing an action: parameter id -> value.

  Values are held to `::lib.schema.parameter/parameter.value`, so a scalar or a sequence of them -- a query action
  binds these to its native template tags, which take multiple values like any other parameter. That is looser than
  [[::prefetch-parameter-values]], where the value is the one primary key spliced into an MBQL `:=` filter.

  `parameter.value` is safe to reuse here only because [[parameter-values-schema]] validates against it rather than
  decoding through it: its `:decode/normalize` quietly rewrites a bad value to `nil`, which for an action that writes
  would store NULL instead of rejecting the request. Validation rejects it outright.

  Unlike [[::prefetch-parameter-values]] these arrive in a JSON body rather than on the query string, so there is no
  JSON string to decode and the keys are already keywords."
  (parameter-values-schema
   {:decoded-key-schema :keyword
    :key-schema         :keyword
    :value-schema       [:ref ::lib.schema.parameter/parameter.value]
    :message            execute-parameter-values-message}))

(mr/def ::execute-parameter-values.string-keys
  "[[::execute-parameter-values]] for the dashcard execute endpoint, whose handler wants string keys: request bodies
  arrive string-keyed and decoding against `[:map-of :string ...]` keeps them that way, converting any keyword keys
  from non-request callers back to strings."
  (parameter-values-schema
   {:decoded-key-schema :string
    :key-schema         [:ref ::lib.schema.parameter/id]
    :value-schema       [:ref ::lib.schema.parameter/parameter.value]
    :message            execute-parameter-values-message}))

(mr/def ::type
  [:enum
   {:decode/normalize keyword
    :description      (deferred-tru "Unsupported action type")}
   :http
   :implicit
   :query])

(mr/def ::http-action.json-query
  [:and
   {:description (deferred-tru "must be a valid json-query, something like ''.item.title''")}
   string?
   [:fn
    {:error/fn (fn [_ _]
                 (deferred-tru "must be a valid json-query, something like ''.item.title''"))}
    #((requiring-resolve 'metabase.actions.http-action/apply-json-query) {} %)]])

(mr/def ::http-action.template
  [:map {:closed true}
   [:method                              [:enum "GET" "POST" "PUT" "DELETE" "PATCH"]]
   [:url                                 [string? {:min 1}]]
   [:body               {:optional true} [:maybe string?]]
   [:headers            {:optional true} [:maybe string?]]
   [:parameters         {:optional true} [:maybe ::parameters.schema/parameters]]])

(def ^:private http-action-entries
  [[:template        {:optional true} [:maybe ::http-action.template]]
   [:response_handle {:optional true} [:maybe ::http-action.json-query]]
   [:error_handle    {:optional true} [:maybe ::http-action.json-query]]])

(mr/def ::http-action
  (into [:map] http-action-entries))

(mr/def ::implicit-action.kind
  [:enum
   {:decode/normalize keyword
    :description      (deferred-tru "Unsupported implicit action kind")}
   :row/create
   :row/update
   :row/delete
   :bulk/create
   :bulk/update
   :bulk/delete])

(def ^:private implicit-action-entries
  [[:kind {:optional true} [:maybe ::implicit-action.kind]]])

(mr/def ::implicit-action
  (into [:map] implicit-action-entries))

(def ^:private query-action-entries
  [[:database_id   {:optional true} [:maybe ::lib.schema.id/database]]
   [:dataset_query {:optional true} [:maybe ::lib-be.schema/maybe-legacy-or-empty-query]]])

(mr/def ::query-action
  (into [:map] query-action-entries))

(mu/defn- action-schema [schema-type :- [:enum :select :update :insert]]
  ;; `required-for-insert` = you have to specify this when you insert a row
  ;;
  ;; `not-null-in-app-db` = this is `NOT NULL` in the app DB, and will always come back when you `SELECT` something,
  ;; but its value is populated automatically on `INSERT` or `UPDATE`.
  (let [required-for-insert (case schema-type
                              (:select :update) {:optional true}
                              :insert           {})
        common              (into
                             []
                             cat
                             [(case schema-type
                                :select [[:id ::id]]
                                :update [[:id {:optional true} ::id]]
                                :insert nil)
                              [[:name                   required-for-insert :string]
                               [:type                   required-for-insert ::type]
                               [:model_id               required-for-insert ::lib.schema.id/card]
                               [:archived               {:optional true}    :boolean]
                               [:description            {:optional true}    [:maybe :string]]
                               [:parameters             {:optional true}    [:maybe ::parameters.schema/parameters]]
                               [:parameter_mappings     {:optional true}    [:maybe ::parameters.schema/parameter-mappings]]
                               [:visualization_settings {:optional true}    [:maybe map?]]]
                              (when (= schema-type :select)
                                ;; technically these are always required, but they are not always selected.
                                [[:created_at {:optional true} (ms/InstanceOfClass java.time.temporal.Temporal)]
                                 [:updated_at {:optional true} (ms/InstanceOfClass java.time.temporal.Temporal)]
                                 ;; TODO (Cam 10/2/25) -- these are things you can set in updates or inserts but aren't things you can pass in
                                 ;; via the API... Maybe we need even more versions of this schema e.g. `::action.for-update.api` versus
                                 ;; `::action.for-update.internal`. or something. Idk.
                                 [:public_uuid       {:optional true} [:maybe ms/UUIDString]]
                                 [:made_public_by_id {:optional true} [:maybe ::lib.schema.id/user]]
                                 [:creator_id        {:optional true} [:maybe ::lib.schema.id/user]]])])]
    [:merge
     (into [:map] common)
     [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
              :dispatch         (comp keyword :type)}
      [:http     (into [:map] http-action-entries)]
      [:implicit (into [:map] implicit-action-entries)]
      [:query    (into [:map] query-action-entries)]
      ;; a partial update need not repeat `:type`; accept every type's keys rather than dropping them
      [nil       (into [:map] cat [http-action-entries implicit-action-entries query-action-entries])]]]))

(mr/def ::action
  "An Action as it should appear when we `SELECT` it from the app DB."
  (action-schema :select))

(mr/def ::action.for-insert
  "Schema for inserting a new Action (REST API or internally)."
  (action-schema :insert))

(mr/def ::action.for-update
  "Schema for updating an Action (REST API or internally)."
  (action-schema :update))
