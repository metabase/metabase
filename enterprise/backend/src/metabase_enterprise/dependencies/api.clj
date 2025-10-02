(ns metabase-enterprise.dependencies.api
  (:require
   [medley.core :as m]
   [metabase-enterprise.dependencies.core :as dependencies]
   [metabase.analyze.core :as analyze]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.lib-be.metadata.jvm :as lib-be.metadata.jvm]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.native-query-snippets.core :as native-query-snippets]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mr/def ::card-body
  [:merge
   ::queries.schema/card
   ;; TODO (Cam 10/1/25) -- merge this into `::queries.schema/card` itself
   [:map
    [:result_metadata {:optional true} [:maybe analyze/ResultsMetadata]]]])

(defn- broken-cards-response
  [{:keys [card transform]}]
  (let [broken-card-ids (keys card)
        broken-cards (when (seq broken-card-ids)
                       (-> (t2/select :model/Card :id [:in broken-card-ids])
                           (t2/hydrate [:collection :effective_ancestors] :dashboard)))
        broken-transform-ids (keys transform)
        broken-transforms (when (seq broken-transform-ids)
                            (t2/select :model/Transform :id [:in broken-transform-ids]))]
    {:success   (and (empty? broken-card-ids)
                     (empty? broken-transform-ids))
     :bad_cards (into [] (comp (filter (fn [card]
                                         (if (mi/can-read? card)
                                           card
                                           (do (log/warnf "Eliding broken card %d - not readable by the user" (:id card))
                                               nil))))
                               (map (fn [card]
                                      (-> card
                                          collection.root/hydrate-root-collection
                                          (update :dashboard #(some-> % (select-keys [:id :name])))))))
                      broken-cards)
     :bad_transforms (into [] broken-transforms)}))

(api.macros/defendpoint :post "/check_card"
  "Check a proposed edit to a card, and return the card IDs for those cards this edit will break."
  [_route-params
   _query-params
   body :- ::card-body]
  (let [database-id    (-> body :dataset_query :database)
        base-provider  (lib-be.metadata.jvm/application-database-metadata-provider database-id)
        original       (lib.metadata/card base-provider (:id body))
        card           (-> original
                           (assoc :dataset-query (:dataset_query body)
                                  :type          (:type body (:type original)))
                           ;; Remove the old `:result-metadata` from the card, it's likely wrong now.
                           (dissoc :result-metadata)
                           ;; But if the request includes `:result_metadata`, use that. It may be from a native card
                           ;; that's been run before saving the card.
                           (cond-> #_card
                            (:result_metadata body) (assoc :result-metadata (:result_metadata body))))
        edits          {:card [card]}
        breakages      (dependencies/errors-from-proposed-edits base-provider edits)]
    (broken-cards-response breakages)))

(mr/def ::transform-body
  [:map
   [:id     {:optional false} ms/PositiveInt]
   [:name   {:optional true}  :string]
   [:source {:optional true}  [:maybe ms/Map]]
   [:target {:optional true}  [:maybe ms/Map]]])

(api.macros/defendpoint :post "/check_transform"
  "Check a proposed edit to a transform, and return the card, transform, etc. IDs for things that will break."
  [_route-params
   _query-params
   {:keys [id source target] :as _body} :- ::transform-body]
  (if (= (keyword (:type source))
         :query)
    (let [database-id   (-> source :query :database)
          base-provider (lib-be.metadata.jvm/application-database-metadata-provider database-id)
          original      (lib.metadata/transform base-provider id)
          transform     (-> original
                            (cond-> #_transform source (assoc :source source))
                            (cond-> #_transform target (assoc :target target)))
          edits         {:transform [transform]}
          breakages     (dependencies/errors-from-proposed-edits base-provider edits)]
      (broken-cards-response breakages))
    ;; if this isn't a sql query, just claim it works
    {:success true}))

(api.macros/defendpoint :post "/check_snippet"
  "Check a proposed edit to a native snippet, and return the cards, etc. which will be broken."
  [_route-params
   _query-params
   {:keys [id content], snippet-name :name}
   :- [:map
       [:id      {:optional false} ms/PositiveInt]
       [:name    {:optional true}  native-query-snippets/NativeQuerySnippetName]
       [:content {:optional true}  :string]]]
  (let [original  (t2/select-one :model/NativeQuerySnippet id)
        _         (when (and snippet-name
                             (not= snippet-name (:name original))
                             (t2/exists? :model/NativeQuerySnippet :name snippet-name))
                    (throw (ex-info (tru "A snippet with that name already exists. Please pick a different name.")
                                    {:status-code 400})))
        snippet   (cond-> (m/assoc-some original
                                        :lib/type :metadata/native-query-snippet
                                        :name snippet-name
                                        :content content)
                    content native-query-snippets/add-template-tags)
        breakages (dependencies/errors-from-proposed-edits {:snippet [snippet]})]
    (broken-cards-response breakages)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/dependencies` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
