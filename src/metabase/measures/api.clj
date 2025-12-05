(ns metabase.measures.api
  "/api/measure endpoints."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.events.core :as events]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api.macros/defendpoint :post "/"
  "Create a new `measure`."
  [_route-params
   _query-params
   {:keys [name description table_id definition], :as body} :- [:map
                                                                [:name        ms/NonBlankString]
                                                                [:table_id    ms/PositiveInt]
                                                                [:definition  ms/Map]
                                                                [:description {:optional true} [:maybe :string]]]]
  (api/create-check :model/measure body)
  (let [measure (api/check-500 (t2/insert-returning-instance! :model/measure
                                                              :table_id    table_id
                                                              :creator_id  api/*current-user-id*
                                                              :name        name
                                                              :description description
                                                              :definition  definition))]
    (events/publish-event! :event/measure-create {:object measure :user-id api/*current-user-id*})
    measure))

(api.macros/defendpoint :get "/:id"
  "Fetch `Measure` with ID."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (-> (api/read-check (t2/select-one :model/Measure :id id))
      (t2/hydrate :definition_description)))
