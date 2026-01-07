(ns metabase.measures.api
  "/api/measure endpoints."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.events.core :as events]
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.legacy-mbql.normalize :as mbql.normalize]
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mr/def ::measure
  "Schema for a Measure entity as returned from the API."
  [:map
   [:id          ms/PositiveInt]
   [:name        ms/NonBlankString]
   [:table_id    ms/PositiveInt]
   [:definition  :map]
   [:description {:optional true} [:maybe :string]]
   [:archived    :boolean]
   [:creator_id  ms/PositiveInt]
   [:created_at  :any]
   [:updated_at  :any]
   [:entity_id   {:optional true} [:maybe :string]]
   [:creator     {:optional true} [:maybe :map]]])

(api.macros/defendpoint :post "/" :- ::measure
  "Create a new `Measure`."
  [_route-params
   _query-params
   {:keys [name description table_id definition], :as body} :- [:map
                                                                [:name        ms/NonBlankString]
                                                                [:table_id    ms/PositiveInt]
                                                                [:definition  ms/Map]
                                                                [:description {:optional true} [:maybe :string]]]]
  (api/create-check :model/Measure body)
  (let [measure (api/check-500
                 (first (t2/insert-returning-instances! :model/Measure
                                                        :table_id    table_id
                                                        :creator_id  api/*current-user-id*
                                                        :name        name
                                                        :description description
                                                        :definition  definition)))]
    (events/publish-event! :event/measure-create {:object measure :user-id api/*current-user-id*})
    (t2/hydrate measure :creator)))

(mu/defn- hydrated-measure [id :- ms/PositiveInt]
  (-> (api/read-check (t2/select-one :model/Measure :id id))
      (t2/hydrate :creator)))

(api.macros/defendpoint :get "/:id" :- ::measure
  "Fetch `Measure` with ID."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (hydrated-measure id))

(api.macros/defendpoint :get "/" :- [:sequential ::measure]
  "Fetch *all* `Measures`."
  []
  (as-> (t2/select :model/Measure, :archived false, {:order-by [[:%lower.name :asc]]}) measures
    (filter mi/can-read? measures)
    (t2/hydrate measures :creator :definition_description)))

(defn- write-check-and-update-measure!
  "Check whether current user has write permissions, then update Measure with values in `body`. Publishes appropriate
  event and returns updated/hydrated Measure."
  [id {:keys [revision_message], :as body}]
  (let [existing   (api/write-check :model/Measure id)
        clean-body (u/select-keys-when body
                                       :present #{:description}
                                       :non-nil #{:archived :definition :name})
        new-def    (when-let [def (:definition clean-body)]
                     (cond->> def
                       (not= :mbql-version/mbql5 (lib/normalized-mbql-version def))
                       (mbql.normalize/normalize ::mbql.s/MBQLQuery)))
        new-body   (merge
                    (dissoc clean-body :revision_message)
                    (when new-def {:definition new-def}))
        changes    (when-not (= new-body existing)
                     new-body)]
    (when changes
      (t2/update! :model/Measure id changes))
    (u/prog1 (hydrated-measure id)
      (events/publish-event! :event/measure-update
                             {:object <> :user-id api/*current-user-id* :revision-message revision_message}))))

(api.macros/defendpoint :put "/:id" :- ::measure
  "Update a `Measure` with ID."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   body :- [:map
            [:name                    {:optional true} [:maybe ms/NonBlankString]]
            [:definition              {:optional true} [:maybe :map]]
            [:revision_message        ms/NonBlankString]
            [:archived                {:optional true} [:maybe :boolean]]
            [:description             {:optional true} [:maybe :string]]]]
  (write-check-and-update-measure! id body))
