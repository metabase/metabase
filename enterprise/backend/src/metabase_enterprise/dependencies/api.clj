(ns metabase-enterprise.dependencies.api
  (:require
   [metabase-enterprise.dependencies.core :as dependencies]
   [metabase.analyze.core :as analyze]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.lib-be.metadata.jvm :as lib-be.metadata.jvm]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mr/def ::card-body
  [:map
   [:id              {:optional false} ms/PositiveInt]
   [:dataset_query   {:optional true}  [:maybe ms/Map]]
   [:type            {:optional true}  [:maybe ::queries.schema/card-type]]
   [:result_metadata {:optional true}  [:maybe analyze/ResultsMetadata]]])

(api.macros/defendpoint :post "/check_card"
  "Check a proposed edit to a card, and return the card IDs for those cards this edit will break."
  [_route-params
   _query-params
   body :- ::card-body]
  (let [database-id   (-> body :dataset_query :database)
        base-provider (lib-be.metadata.jvm/application-database-metadata-provider database-id)
        original      (lib.metadata/card base-provider (:id body))
        card          (-> original
                          (assoc :dataset-query (:dataset_query body)
                                 :type          (:type body (:type original)))
                          (dissoc :result-metadata)
                          (cond-> #_card
                           (:result_metadata body) (assoc :result-metadata (:result_metadata body))))
        ;; TODO: This sucks - it's getting all cards for the same database_id, which is slow and over-reaching.
        all-cards     (t2/select-fn-set :id :model/Card :database_id database-id :archived false)
        breakages     (dependencies/check-cards-have-sound-refs base-provider [card] all-cards)
        broken-ids    (keys breakages)
        broken-cards  (when (seq broken-ids)
                        (-> (t2/select :model/Card :id [:in broken-ids])
                            (t2/hydrate [:collection :effective_ancestors] :dashboard)))]
    {:success   (empty? breakages)
     :bad_cards (into [] (comp (filter (fn [card]
                                         (if (mi/can-read? card)
                                           card
                                           (do (log/warnf "Eliding broken card %d - not readable by the user" (:id card))
                                               nil))))
                               (map (fn [card]
                                      (-> card
                                          collection.root/hydrate-root-collection
                                          (update :dashboard #(some-> % (select-keys [:id :name])))))))
                      broken-cards)}))

(api.macros/defendpoint :post "/check_transform"
  "Check a proposed edit to a transform, and return the card, transform, etc. IDs for things that will break."
  [_route-params
   _query-params
   _body :- [:map [:id ms/PositiveInt]]]
  ;; FIXME: This is just a stub - implement it!
  {:success true})

(api.macros/defendpoint :post "/check_snippet"
  "Check a proposed edit to a native snippet, and return the cards, etc. which will be broken."
  [_route-params
   _query-params
   _body :- [:map [:id ms/PositiveInt]]]
  ;; FIXME: This is just a stub - implement it!
  {:success true})

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/dependencies` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
