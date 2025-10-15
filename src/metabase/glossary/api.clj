(ns metabase.glossary.api
  "API endpoints for managing glossary entries."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api.macros/defendpoint :get "/"
  "Fetch all glossary entries, optionally filtered by search term."
  [_route-params
   {:keys [search]} :- [:maybe [:map [:search {:optional true} [:maybe ms/NonBlankString]]]]]
  (let [where (when search
                [:or
                 [:like [:lower :term] [:lower (str "%" search "%")]]
                 [:like [:lower :definition] [:lower (str "%" search "%")]]])]
    {:data (t2/select :model/Glossary (cond-> {:order-by [[:term :asc]]}
                                        where (assoc :where where)))}))

(api.macros/defendpoint :post "/"
  "Create a new glossary entry."
  [_route-params
   _query-params
   {:keys [term definition]} :- [:map
                                 [:term ms/NonBlankString]
                                 [:definition ms/NonBlankString]]]
  (t2/insert-returning-instance! :model/Glossary {:term term :definition definition}))

(api.macros/defendpoint :put "/:id"
  "Update an existing glossary entry."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [term definition]} :- [:map
                                 [:term ms/NonBlankString]
                                 [:definition ms/NonBlankString]]]
  (api/check-404 (t2/select-one :model/Glossary :id id))
  (t2/update! :model/Glossary id {:term term :definition definition})
  (t2/select-one :model/Glossary :id id))

(api.macros/defendpoint :delete "/:id"
  "Delete a glossary entry."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-404 (t2/select-one :model/Glossary :id id))
  (t2/delete! :model/Glossary :id id)
  api/generic-204-no-content)
