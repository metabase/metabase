(ns metabase.agent-api.projections
  "The single home for the concise field set of every entity a v2 read tool returns.

   A tool does not choose its own field set — it looks the entity up here and hands the spec to
   [[metabase.agent-api.tools/project]], so the same entity reads the same way through every tool that
   returns it.

   Fields are REST property names, verbatim: a projection is a `select-keys` over the REST response, so
   there are no renames and no invented vocabulary to translate back at write time, and a read
   round-trips into a write.

   Concise omits a resource's inlined children. An agent pays for a payload in context on every listing,
   and a wide schema exhausts the response budget before the agent has learned anything but the parent's
   name. The children have dedicated, budgeted paths of their own, so the parent projection stays small
   and the drill-down is a decision the agent makes.

   `:detailed` is absent everywhere: detail is the whole REST record, and enumerating it here would be a
   second copy of the API to keep in step. An entity needs a `:detailed` set only when its full record is
   too big to return at all.")

(set! *warn-on-reflection* true)

(def specs
  "Entity → `{:concise [ks…]}`, the argument [[metabase.agent-api.tools/project]] takes."
  {:card             {:concise [:id :name :type :display :description :database_id :collection_id :archived]}
   :collection       {:concise [:id :name :description :location :parent_id :type :authority_level
                                :is_personal :is_remote_synced :archived]}
   :collection-item  {:concise [:id :name :model :description :collection_id :archived]}
   :dashboard        {:concise [:id :name :description :collection_id :archived]}
   :dashcard         {:concise [:id :card_id :dashboard_id :dashboard_tab_id :row :col :size_x :size_y]}
   ;; A database's `tables` and a table's `fields` stay out of the parent: `browse_data`'s `get_fields` is
   ;; the budgeted path to them.
   :database         {:concise [:id :name :engine :is_saved_questions]}
   :document         {:concise [:id :name :collection_id :creator_id :can_write :archived]}
   :field            {:concise [:id :name :display_name :description :base_type :semantic_type
                                :table_id :fk_target_field_id]}
   :field-values     {:concise [:field_id :values :has_more_values]}
   :measure          {:concise [:id :name :description :table_id :archived]}
   :parameter-values {:concise [:values :has_more_values]}
   ;; `collection_path` ("Finance / KPIs") is resolved server-side in one batch: the search engine gives a
   ;; hit only its immediate collection, and an agent that wants to tell the user where something lives
   ;; would otherwise walk the tree once per hit.
   :search-result    {:concise [:id :name :type :description :collection_path]}
   :segment          {:concise [:id :name :description :table_id :archived]}
   :snippet          {:concise [:id :name :description :collection_id :archived]}
   :table            {:concise [:id :name :display_name :description :schema :db_id :entity_type
                                :is_published]}
   :timeline         {:concise [:id :name :description :icon :default :collection_id :archived]}
   :timeline-event   {:concise [:id :name :description :icon :timestamp :timeline_id :archived]}
   :transform        {:concise [:id :name :description :source_type :target :target_db_id]}})

(defn spec
  "The projection spec for `entity`. Throws when the entity has none: a read tool that invents its own
   field set is exactly what this registry exists to prevent, so there is no silent fallback."
  [entity]
  (or (specs entity)
      (throw (ex-info (str "No projection registered for " entity)
                      {:entity entity :registered (sort (keys specs))}))))
