(ns metabase.api.metric
  "/api/metric endpoints."
  (:require
   [clojure.data :as data]
   [compojure.core :refer [DELETE GET POST PUT]]
   [metabase.api.common :as api]
   [metabase.events :as events]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.models :refer [Metric  MetricImportantField Table]]
   [metabase.models.interface :as mi]
   [metabase.models.revision :as revision]
   [metabase.related :as related]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api/defendpoint POST "/"
  "Create a new `Metric`."
  [:as {{:keys [name description table_id definition], :as body} :body}]
  {name        ms/NonBlankString
   table_id    ms/PositiveInt
   definition  :map
   description [:maybe :string]}
  ;; TODO - why can't set the other properties like `show_in_getting_started` when you create a Metric?
  (api/create-check Metric body)
  (let [metric (api/check-500
                (first (t2/insert-returning-instances! Metric
                                                       :table_id    table_id
                                                       :creator_id  api/*current-user-id*
                                                       :name        name
                                                       :description description
                                                       :definition  definition)))]
    (events/publish-event! :event/metric-create {:object metric :actor-id api/*current-user-id*})
    (t2/hydrate metric :creator)))

(mu/defn ^:private hydrated-metric [id :- ms/PositiveInt]
  (-> (api/read-check (t2/select-one Metric :id id))
      (t2/hydrate :creator)))

(api/defendpoint GET "/:id"
  "Fetch `Metric` with ID."
  [id]
  {id ms/PositiveInt}
  (hydrated-metric id))

(defn- add-db-ids
  "Add `:database_id` fields to `metrics` by looking them up from their `:table_id`."
  [metrics]
  (when (seq metrics)
    (let [table-id->db-id (t2/select-pk->fn :db_id Table, :id [:in (set (map :table_id metrics))])]
      (for [metric metrics]
        (assoc metric :database_id (table-id->db-id (:table_id metric)))))))

(api/defendpoint GET "/"
  "Fetch *all* `Metrics`."
  []
  (as-> (t2/select Metric, :archived false, {:order-by [:%lower.name]}) metrics
    (t2/hydrate metrics :creator :definition_description)
    (add-db-ids metrics)
    (filter mi/can-read? metrics)
    metrics))

(defn- write-check-and-update-metric!
  "Check whether current user has write permissions, then update Metric with values in `body`. Publishes appropriate
  event and returns updated/hydrated Metric."
  [id {:keys [revision_message] :as body}]
  (let [existing   (api/write-check Metric id)
        clean-body (u/select-keys-when body
                     :present #{:description :caveats :how_is_this_calculated :points_of_interest}
                     :non-nil #{:archived :definition :name :show_in_getting_started})
        new-def    (->> clean-body :definition (mbql.normalize/normalize-fragment []))
        new-body   (merge
                     (dissoc clean-body :revision_message)
                     (when new-def {:definition new-def}))
        changes    (when-not (= new-body existing)
                     new-body)
        archive?   (:archived changes)]
    (when changes
      (t2/update! Metric id changes))
    (u/prog1 (hydrated-metric id)
      (events/publish-event! (if archive? :event/metric-delete :event/metric-update)
                             {:object           <>
                              :actor-id         api/*current-user-id*
                              :revision-message revision_message}))))


(api/defendpoint PUT "/:id"
  "Update a `Metric` with ID."
  [id :as {{:keys [name definition revision_message archived caveats description how_is_this_calculated
                   points_of_interest show_in_getting_started]
            :as   body} :body}]
  {id                      ms/PositiveInt
   name                    [:maybe ms/NonBlankString]
   definition              [:maybe :map]
   revision_message        ms/NonBlankString
   archived                [:maybe :boolean]
   caveats                 [:maybe :string]
   description             [:maybe :string]
   how_is_this_calculated  [:maybe :string]
   points_of_interest      [:maybe :string]
   show_in_getting_started [:maybe :boolean]}
  (write-check-and-update-metric! id body))

(api/defendpoint PUT "/:id/important_fields"
  "Update the important `Fields` for a `Metric` with ID.
   (This is used for the Getting Started guide)."
  [id :as {{:keys [important_field_ids]} :body}]
  {id                  ms/PositiveInt
   important_field_ids [:sequential ms/PositiveInt]}
  (api/check-superuser)
  (api/write-check Metric id)
  (api/check (<= (count important_field_ids) 3)
    [400 "A Metric can have a maximum of 3 important fields."])
  (let [[fields-to-remove fields-to-add] (data/diff (set (t2/select-fn-set :field_id 'MetricImportantField :metric_id id))
                                                    (set important_field_ids))]

    ;; delete old fields as needed
    (when (seq fields-to-remove)
      (t2/delete! (t2/table-name MetricImportantField) {:metric_id id, :field_id [:in fields-to-remove]}))
    ;; add new fields as needed
    (t2/insert! 'MetricImportantField (for [field-id fields-to-add]
                                        {:metric_id id, :field_id field-id}))
    {:success true}))

(api/defendpoint DELETE "/:id"
  "Archive a Metric. (DEPRECATED -- Just pass updated value of `:archived` to the `PUT` endpoint instead.)"
  [id revision_message]
  {id               ms/PositiveInt
   revision_message ms/NonBlankString}
  (log/warn
   (trs "DELETE /api/metric/:id is deprecated. Instead, change its `archived` value via PUT /api/metric/:id."))
  (write-check-and-update-metric! id {:archived true, :revision_message revision_message})
  api/generic-204-no-content)

(api/defendpoint GET "/:id/revisions"
  "Fetch `Revisions` for `Metric` with ID."
  [id]
  {id ms/PositiveInt}
  (api/read-check Metric id)
  (revision/revisions+details Metric id))

(api/defendpoint POST "/:id/revert"
  "Revert a `Metric` to a prior `Revision`."
  [id :as {{:keys [revision_id]} :body}]
  {id          ms/PositiveInt
   revision_id ms/PositiveInt}
  (api/write-check Metric id)
  (revision/revert!
   {:entity      Metric
    :id          id
    :user-id     api/*current-user-id*
    :revision-id revision_id}))

(api/defendpoint GET "/:id/related"
  "Return related entities."
  [id]
  {id ms/PositiveInt}
  (-> (t2/select-one Metric :id id) api/read-check related/related))

(api/define-routes)
