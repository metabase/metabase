(ns metabase-enterprise.data-apps.generate.actions
  "The YAML files of the implicit actions a data app defines with `defineAction` in its `metabase.actions.ts`, each
  named after its export."
  (:require
   [metabase-enterprise.data-apps.generate.util :as generate.util]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase.api.common :as api]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- action
  "The implicit action named `action-name` with entity ID `entity-id` in the collection with `collection-entity-id`,
  doing `kind` on the table with `table-id`, as an export extracts it."
  [action-name entity-id collection-entity-id kind table-id]
  {:serdes/meta            [{:model "Action" :id entity-id :label (serialization/slugify-name action-name)}]
   :entity_id              entity-id
   :name                   action-name
   :type                   "implicit"
   :collection_id          collection-entity-id
   :creator_id             (serdes/*export-user* api/*current-user-id*)
   :implicit               [{:kind kind :table_id (serdes/*export-table-fk* table-id)}]
   :parameters             []
   :parameter_mappings     []
   :query                  []
   :visualization_settings {}})

(defn generate
  "The files of the implicit actions in `definitions`, a map of export name to `{:entityId .. :kind .. :table {:id ..}}`,
  in the data app's collection with entity ID `collection-entity-id`, each at its path in the collection's directory."
  [collection-entity-id definitions]
  (vec (for [[export-name {:keys [entityId kind] {table-id :id} :table}] definitions
             :let [export-name (u/qualified-name export-name)]]
         (generate.util/resource-file export-name (action export-name entityId collection-entity-id kind table-id)))))
