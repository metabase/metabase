(ns metabase.slides.api.slides
  "`/api/slides/` routes — CRUD for slide decks."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.models.collection :as collection]
   [metabase.slides.models.slides :as m.slides]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private SlidesCreateOptions
  [:map
   [:name m.slides/SlidesName]
   [:slides {:optional true} [:maybe m.slides/SlidesArray]]
   [:collection_id {:optional true} [:maybe ms/PositiveInt]]])

(def ^:private SlidesUpdateOptions
  [:map
   [:name {:optional true} m.slides/SlidesName]
   [:slides {:optional true} [:maybe m.slides/SlidesArray]]
   [:collection_id {:optional true} [:maybe ms/PositiveInt]]
   [:archived {:optional true} [:maybe :boolean]]])

(defn- default-blank-slides
  "The single empty slide a brand-new deck ships with."
  []
  [{:id "slide-1"
    :layout "default"
    :doc {:type "doc"
          :content [{:type "paragraph"}]}}])

(defn- get-deck [deck-id]
  (api/check-404
   (-> (t2/select-one :model/Slides :id deck-id)
       (t2/hydrate :creator))))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "List all visible slide decks."
  [_route-params
   _query-params]
  {:items (t2/hydrate
           (t2/select :model/Slides
                      {:where [:and
                               (collection/visible-collection-filter-clause)
                               [:= :archived false]]
                       :order-by [[:updated_at :desc]]})
           :creator)})

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a new slide deck."
  [_route-params
   _query-params
   {:keys [name slides collection_id]} :- SlidesCreateOptions]
  (api/create-check :model/Slides {:collection_id collection_id})
  (let [deck-id (t2/insert-returning-pk! :model/Slides
                                         {:name name
                                          :slides (or slides (default-blank-slides))
                                          :collection_id collection_id
                                          :creator_id api/*current-user-id*})]
    (get-deck deck-id)))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:deck-id"
  "Get a slide deck by ID."
  [{:keys [deck-id]} :- [:map [:deck-id ms/PositiveInt]]]
  (api/read-check (get-deck deck-id)))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:deck-id"
  "Update a slide deck."
  [{:keys [deck-id]} :- [:map [:deck-id ms/PositiveInt]]
   _query-params
   {:keys [name slides collection_id archived] :as body} :- SlidesUpdateOptions]
  (let [existing (api/check-404 (t2/select-one :model/Slides :id deck-id))]
    (when-not (contains? body :archived)
      (api/check-not-archived existing))
    (api/write-check existing)
    (when (api/column-will-change? :collection_id existing body)
      (m.slides/validate-collection-move-permissions (:collection_id existing) collection_id))
    (t2/update! :model/Slides deck-id
                (cond-> {}
                  name                            (assoc :name name)
                  slides                          (assoc :slides slides)
                  (contains? body :collection_id) (assoc :collection_id collection_id)
                  (contains? body :archived)      (assoc :archived (boolean archived))))
    (get-deck deck-id)))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:deck-id"
  "Permanently delete an archived deck."
  [{:keys [deck-id]} :- [:map [:deck-id ms/PositiveInt]]]
  (let [deck (api/check-404 (t2/select-one :model/Slides :id deck-id))]
    (api/write-check deck)
    (when-not (:archived deck)
      (let [msg (tru "Slide deck must be archived before it can be deleted.")]
        (throw (ex-info msg {:status-code 400 :errors {:archived msg}}))))
    (t2/delete! :model/Slides :id deck-id)
    api/generic-204-no-content))

(def ^{:arglists '([request respond raise])} routes
  "`/api/slides/` routes."
  (api.macros/ns-handler *ns* +auth))
