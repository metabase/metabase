(ns metabase-enterprise.data-apps.generate.queries
  "The YAML files of the questions a data app defines with `defineQuery` in its `metabase.queries.ts`, each named after
  its export, built as the dev preview runs it."
  (:require
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.generate.util :as generate.util]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.models.serialization :as serdes]
   [metabase.queries.core :as queries]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- build-query
  "The query Lib builds from the query definition `query`."
  [query]
  (let [table-id (get-in query [:stages 0 :source :id])
        mp       (lib-be/application-database-metadata-provider (:db_id (api/check-404 (data-apps.db/table table-id))))]
    (lib/test-query mp query)))

(defn- card
  "The question named `card-name` with entity ID `entity-id` in the collection with `collection-entity-id`, holding the
  query `query` builds, as an export extracts it."
  [card-name entity-id collection-entity-id query]
  (let [query (build-query query)]
    (-> (serdes/extract-one "Card" {} {:entity_id              entity-id
                                       :name                   card-name
                                       :card_schema            queries/current-card-schema-version
                                       :type                   :question
                                       :display                :table
                                       :creator_id             api/*current-user-id*
                                       :database_id            (:database query)
                                       :dataset_query          (lib/prepare-for-serialization query)
                                       :visualization_settings {}
                                       :parameters             []
                                       :parameter_mappings     []})
        (assoc :collection_id collection-entity-id))))

(defn generate
  "The files of the questions in `definitions`, a map of export name to `{:entityId .. :query ..}`, in the data app's
  collection with entity ID `collection-entity-id`, each at its path in the collection's directory."
  [collection-entity-id definitions]
  (vec (for [[export-name {:keys [entityId query]}] definitions
             :let [export-name (u/qualified-name export-name)]]
         (generate.util/resource-file export-name (card export-name entityId collection-entity-id query)))))
