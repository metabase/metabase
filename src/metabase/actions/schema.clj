(ns metabase.actions.schema
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::id
  "Valid Action ID"
  pos-int?)

(mr/def ::type
  [:enum
   {:description (deferred-tru "Unsupported action type")}
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

(mr/def ::http-action
  [:map
   [:template        {:optional true} [:maybe ::http-action.template]]
   [:response_handle {:optional true} [:maybe ::http-action.json-query]]
   [:error_handle    {:optional true} [:maybe ::http-action.json-query]]])

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

(mr/def ::implicit-action
  [:map
   [:kind {:optional true} [:maybe ::implicit-action.kind]]])

(mr/def ::query-action
  [:map
   [:database_id   {:optional true} [:maybe ::lib.schema.id/database]]
   [:dataset_query {:optional true} [:maybe ::queries.schema/query]]])

(mu/defn- action-schema [schema-type :- [:enum :select :update :insert]]
  ;; `required-for-insert` = you have to specify this when you insert a row
  ;;
  ;; `not-null-in-app-db` = this is `NOT NULL` in the app DB, and will always come back when you `SELECT` something,
  ;; but its value is populated automatically on `INSERT` or `UPDATE`.
  (let [required-for-insert (case schema-type
                              (:select :update) {:optional true}
                              :insert           {})]
    [:and
     (into
      [:map]
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
          [:creator_id        {:optional true} [:maybe ::lib.schema.id/user]]])])
     [:multi
      {:dispatch :type}
      [:http     ::http-action]
      [:implicit ::implicit-action]
      [:query    ::query-action]
      [nil       :map]]]))

(mr/def ::action
  "An Action as it should appear when we `SELECT` it from the app DB."
  (action-schema :select))

(mr/def ::action.for-insert
  "Schema for inserting a new Action (REST API or internally)."
  (action-schema :insert))

(mr/def ::action.for-update
  "Schema for updating an Action (REST API or internally)."
  (action-schema :update))
