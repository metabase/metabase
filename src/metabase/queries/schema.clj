(ns metabase.queries.schema
  (:require
   [metabase.analyze.core :as analyze]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mr/def ::query.non-empty
  [:and
   [:map
    {:decode/normalize #'lib-be/normalize-query}]
   [:ref ::lib.schema/query]])

(mr/def ::query
  "Schema for a valid Card `dataset_query`."
  ;; apparently a Card is allowed to be saved with an empty query map, whether or not this makes sense... we have
  ;; hundreds of tests that do it tho so I guess we'll just have to allow it for now.
  [:and
   :map
   [:multi {:dispatch (comp boolean empty?)}
    [true  [:= {:description "empty map"} {}]]
    [false [:ref ::query.non-empty]]]])

(mr/def ::card.result-metadata
  "Cards still expect legacy-style metadata... for now."
  analyze/ResultsMetadata)

;;; TODO (Cam 9/17/25) -- fill this out a bit more. We can use a lot of stuff from
;;; `:metabase.lib.schema.metadata/card`
(mr/def ::card
  "General schema for a `:model/Card` when it comes out of the app DB for CRU operations. Mostly everything is marked
  `:optional` here to facilitate use in partial updates (patching)."
  [:and
   [:map
    [:archived               {:optional true} [:maybe :boolean]]
    [:cache_ttl              {:optional true} [:maybe ms/PositiveInt]]
    [:collection_id          {:optional true} [:maybe ::lib.schema.id/collection]]
    [:collection_position    {:optional true} [:maybe [:or
                                                       ms/PositiveInt
                                                       ;; Honey SQL to increment collection position.
                                                       [:= [:+ :collection_position 1]]
                                                       [:= [:- :collection_position 1]]]]]
    [:collection_preview     {:optional true} [:maybe :boolean]]
    [:dashboard_id           {:optional true} [:maybe ::lib.schema.id/dashboard]]
    [:dashboard_tab_id       {:optional true} [:maybe ms/PositiveInt]]
    [:dataset_query          {:optional true} [:maybe ::query]]
    [:description            {:optional true} [:maybe :string]]
    [:display                {:optional true} [:maybe [:keyword {:decode/normalize lib.schema.common/normalize-keyword}]]]
    [:embedding_params       {:optional true} [:maybe ms/EmbeddingParams]]
    [:enable_embedding       {:optional true} [:maybe :boolean]]
    [:id                     {:optional true} [:maybe ::lib.schema.id/card]]
    [:name                   {:optional true} [:maybe ms/NonBlankString]]
    [:parameter_mappings     {:optional true} [:maybe [:sequential ::parameters.schema/parameter-mapping]]]
    [:parameters             {:optional true} [:maybe [:sequential ::parameters.schema/parameter]]]
    [:result_metadata        {:optional true} [:maybe ::card.result-metadata]]
    [:type                   {:optional true} [:maybe ::lib.schema.metadata/card.type]]
    [:visualization_settings {:optional true} [:maybe ms/Map]]]
   [:fn
    {:error/message    "Card database_id must match dataset_query.database"
     :decode/normalize (fn [{{query-database-id :database} :dataset_query, :as card}]
                         (cond-> card
                           (pos-int? query-database-id)
                           (assoc :database_id query-database-id)))}
    (fn [{database-id :database_id, {query-database-id :database} :dataset_query, :as _card}]
      (if (and database-id query-database-id)
        (= database-id query-database-id)
        true))]])

(mr/def ::card.updates
  "Version of `::card` for updates. The same as `::card` but if you're going to update `:dataset_query` it has to be
  something valid."
  [:merge
   [:ref ::card]
   [:map
    [:dataset_query {:optional true} [:ref ::query.non-empty]]]])

(mu/defn normalize-card :- ::card
  ([card]
   (normalize-card card ::card))
  ([card :- :map
    schema]
   (try
     (lib/normalize schema card)
     (catch Throwable e
       (throw (ex-info (i18n/tru "Invalid Card: {0}" (ex-message e))
                       {:card card}
                       e))))))
