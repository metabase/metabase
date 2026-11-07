(ns metabase-enterprise.data-apps.generate.queries
  "The YAML files of the questions a data app defines with `defineQuery` in its `metabase.queries.ts`, each named after
  its export, built as the dev preview runs it."
  (:require
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.generate.util :as generate.util]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.queries.core :as queries]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- build-query
  "The query Lib builds from the query definition `query`."
  [query]
  (let [table-id (get-in query [:stages 0 :source :id])
        mp       (lib-be/application-database-metadata-provider (:db_id (api/check-404 (data-apps.db/table table-id))))]
    (lib/test-query mp query)))

(defn- card
  "The question named `card-name` with entity ID `entity-id`, holding the query `query` builds, as the Card row an export
  takes."
  [card-name entity-id query]
  (let [query (build-query query)]
    {:entity_id              entity-id
     :name                   card-name
     :card_schema            queries/current-card-schema-version
     :type                   :question
     :display                :table
     :creator_id             api/*current-user-id*
     :database_id            (:database query)
     :dataset_query          (lib/prepare-for-serialization query)
     :visualization_settings {}
     :parameters             []
     :parameter_mappings     []}))

(defn generate
  "The files of the questions in `definitions`, a map of export name to `{:entityId .. :query ..}`, in the data app's
  collection with entity ID `collection-entity-id`, each at its path in the collection's directory."
  [collection-entity-id definitions]
  (let [names    (mapv (comp u/qualified-name key) definitions)
        cards    (mapv (fn [card-name {:keys [entityId query]}] (card card-name entityId query))
                       names (vals definitions))
        exported (serialization/export-batch :model/Card cards)]
    (mapv (fn [card-name exported]
            (when (instance? Exception exported)
              (throw exported))
            (generate.util/resource-file card-name (assoc exported :collection_id collection-entity-id)))
          names exported)))
