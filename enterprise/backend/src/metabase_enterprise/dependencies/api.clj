(ns metabase-enterprise.dependencies.api
  (:require
   [metabase-enterprise.dependencies.core :as dependencies]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
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
   [:id            {:optional false} ms/PositiveInt]
   [:dataset_query {:optional true}  [:maybe ms/Map]]
   [:type          {:optional true}  [:maybe ::queries.schema/card-type]]])

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
                          (dissoc :result-metadata))
        ;; TODO: This sucks - it's getting all cards for the same database_id, which is slow and over-reaching.
        all-cards     (t2/select-fn-set :id :model/Card :database_id database-id)
        breakages     (dependencies/check-cards-have-sound-refs base-provider [card] all-cards)
        broken-ids    (keys breakages)
        broken-cards  (when (seq broken-ids)
                        (t2/select :model/Card :id [:in broken-ids]))]
    {:success   (empty? breakages)
     :bad_cards (into [] (filter (fn [card]
                                   (if (mi/can-read? card)
                                     card
                                     (do (log/warnf "Eliding broken card %d - not readable by the user" (:id card))
                                         nil))))
                      broken-cards)}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/dependencies` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
