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
  "Entity → `{:concise [ks…]}`, the argument [[metabase.agent-api.tools/project]] takes.

   A field name here is not always a `select-keys` away: a dashboard's `dashcards`, `tabs`, and
   `parameters` are summary rows built by `get_content`, and a document's `content_markdown` is its stored
   ProseMirror tree rendered. The names are what this registry pins."
  {:alert            {:concise [:id :name :alert_condition :alert_above_goal :alert_first_only :card
                                :channels :archived]}
   ;; `table_id` and `source_card_id` are FK columns on the card row itself — nothing to fetch, nothing to
   ;; compute — and what a question is built on is the first thing an agent needs in order to read the
   ;; source's fields, filter a column, or point a new question at the same source. Three FKs and no
   ;; fourth: what depends on *this* card is a lineage question this registry does not answer.
   :card             {:concise [:id :name :type :display :description :database_id :table_id
                                :source_card_id :collection_id :archived]}
   :collection       {:concise [:id :name :description :location :parent_id :authority_level
                                :is_personal :is_remote_synced :archived]}
   ;; `type` is the one vocabulary the tools speak to each other in: `search` filters on it, `get_content`
   ;; is addressed by `{type, id}`, and `browse_collection` filters on it — so a hit from discovery is an
   ;; argument a read takes without a translation table in between. A collection's own `type` column (the
   ;; one naming `instance-analytics` and friends) loses the name to the address; `location`,
   ;; `is_personal`, and `archived` carry what it would have been used for. `collection_position` (the pin
   ;; marker) and `last-edit-info` are what the collection page puts on the row, so "which of these is
   ;; pinned, and which did someone touch last week" is answered from the listing rather than from a read
   ;; per item.
   :collection-item  {:concise [:id :name :type :description :collection_id :collection_position
                                :last-edit-info :archived]}
   ;; A dashboard's children are summarized rather than inlined: a dashcard row carries exactly what the
   ;; `dashboard_write` op grammar takes (dashcard id, kind, card id and name, tab, geometry, series,
   ;; inline parameters), and the parameters come with the dashcards each one filters — wiring an agent has
   ;; no other way to see. The test of the shape is that any structural op is authorable from the concise
   ;; read alone. `include: ["layout"]` returns the raw dashcards, which is what `patch_dashcard` edits
   ;; against.
   :dashboard        {:concise [:id :name :description :collection_id :archived
                                :tabs :parameters :dashcards]}
   :dashcard         {:concise [:id :card_id :dashboard_id :dashboard_tab_id :row :col :size_x :size_y]}
   ;; A database's `tables` and a table's `fields` stay out of the parent: `browse_data`'s `get_fields` is
   ;; the budgeted path to them.
   :database         {:concise [:id :name :engine :is_saved_questions]}
   ;; The stored ProseMirror tree is not a form an agent can read a paragraph out of, and emphatically not
   ;; one it can write — hand-authored `content` arrays with mark ranges render wrong in ways the model
   ;; cannot see. `get_content` renders the tree as Markdown and `document_write` parses Markdown back, and
   ;; the same dialect in both directions is what makes read → edit → write a loop rather than a leap.
   :document         {:concise [:id :name :collection_id :creator_id :can_write :archived
                                :content_markdown]}
   :field            {:concise [:id :name :display_name :description :base_type :semantic_type
                                :table_id :fk_target_field_id]}
   :field-values     {:concise [:field_id :values :has_more_values]}
   :measure          {:concise [:id :name :description :table_id :archived]}
   :parameter-values {:concise [:values :has_more_values]}
   :result-column    {:concise [:name :display_name :description :base_type :effective_type
                                :semantic_type]}
   :revision         {:concise [:id :timestamp :user :description :is_creation :is_reversion]}
   ;; `collection_path` ("Finance / KPIs") is resolved server-side in one batch: the search engine gives a
   ;; hit only its immediate collection, and an agent that wants to tell the user where something lives
   ;; would otherwise walk the tree once per hit.
   :search-result    {:concise [:id :name :type :description :collection_path]}
   :segment          {:concise [:id :name :description :table_id :archived]}
   :snippet          {:concise [:id :name :description :collection_id :archived]}
   :subscription     {:concise [:id :name :dashboard_id :collection_id :skip_if_empty :parameters
                                :channels :archived]}
   :table            {:concise [:id :name :display_name :description :schema :db_id :entity_type
                                :is_published]}
   ;; An event's id is the only handle `timeline_event_write` has on it, and "actually it was the 4th" is
   ;; an update to an existing event rather than a second one at a different date. So the read that finds
   ;; the timeline is the read that hands back the event ids, or the correction becomes a duplicate.
   :timeline         {:concise [:id :name :description :icon :default :collection_id :archived
                                :events]}
   :timeline-event   {:concise [:id :name :description :icon :timestamp :timeline_id :archived]}
   :transform        {:concise [:id :name :description :source_type :target :target_db_id]}})

(defn spec
  "The projection spec for `entity`. Throws when the entity has none: a read tool that invents its own
   field set is exactly what this registry exists to prevent, so there is no silent fallback."
  [entity]
  (or (specs entity)
      (throw (ex-info (str "No projection registered for " entity)
                      {:entity entity :registered (sort (keys specs))}))))
