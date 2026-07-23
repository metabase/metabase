(ns metabase.metabot.agent.streaming
  "Streaming helpers for the agent loop.
  Provides utilities for creating AI-SDK data parts and transducers for stream
  processing."
  (:require
   [buddy.core.codecs :as codecs]
   [metabase.metabot.agent.markdown-link-buffer :as markdown-link-buffer]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

;;; AI-SDK Data Types
;;
;; These match the Python AI Service's AISDKDataTypes enum

(def state-type "AI-SDK data type for state updates." "state")
(def todo-list-type "AI-SDK data type for todo lists." "todo_list")
(def code-edit-type "AI-SDK data type for code edits." "code_edit")
(def transform-suggestion-type "AI-SDK data type for transform suggestions." "transform_suggestion")
(def generated-entity-type "AI-SDK data type for generated entities." "generated_entity")
(def entity-saved-type "AI-SDK data type for saved-entity annotations." "entity_saved")
(def adhoc-viz-type "AI-SDK data type for ad-hoc visualizations." "adhoc_viz")
(def static-viz-type "AI-SDK data type for static visualizations." "static_viz")
(def search-results-type "AI-SDK data type for a search tool's result list." "search_results")

(def ^:private ephemeral-data-types
  "Data types not written to MetabotMessage.data."
  ;; state is diffed separately into the row's state column
  ;; search_results renders under the client-only chain of thought, never rehydrated
  #{state-type search-results-type})

(defn persistable-data-part?
  "True if `part` should be written to MetabotMessage.data. `state` parts are
  skipped because their value is diffed separately into MetabotMessage.state;
  duplicating the full blob in the message data would bloat storage. Non-data
  parts are always persistable here; the caller is responsible for filtering
  stream-level metadata
  (`:start`, `:usage`, `:finish`) separately."
  [part]
  (not (and (= :data (:type part))
            (contains? ephemeral-data-types (:data-type part)))))

;;; Query URL Encoding

(defn query->url-hash
  "Convert an MBQL 4 (legacy) or MBQL 5 query to a base64-encoded URL hash.
  When `display` is provided, includes it so the frontend renders the
  correct visualization type instead of defaulting to table.
  Used for /question# URLs."
  ([query]
   (query->url-hash query nil))
  ([query display]
   (-> (cond-> {:dataset_query query}
         display (assoc :display (name display)))
       json/encode
       (.getBytes "UTF-8")
       codecs/bytes->b64-str)))

(defn query->question-url
  "Convert a query to a /question# URL.
  Optional `display` sets the visualization type (e.g. :line, :bar)."
  ([query]
   (query->question-url query nil))
  ([query display]
   (str "/question#" (query->url-hash query display))))

;;; Data Part Constructors

(defn state-part
  "Create a STATE data part for streaming."
  [state-map]
  {:type :data
   :data-type state-type
   :data state-map})

(defn todo-list-part
  "Create a TODO_LIST data part for streaming.
  Todos should be a vector of todo item maps with :id, :content, :status, :priority keys.

  This matches Python AI Service's:
  ai_sdk.create_data_part(data_type=AISDKDataTypes.TODO_LIST, version=1, value=todos)"
  [todos]
  {:type :data
   :data-type todo-list-type
   :data todos})

(defn code-edit-part
  "Create a CODE_EDIT data part for streaming.
  Edit-data should be a map describing the code edit operation.

  This matches Python AI Service's:
  ai_sdk.create_data_part(data_type=AISDKDataTypes.CODE_EDIT, version=1, value=edit_data)"
  [edit-data]
  {:type :data
   :data-type code-edit-type
   :data edit-data})

(defn transform-suggestion-part
  "Create a TRANSFORM_SUGGESTION data part for streaming.
  Suggestion should be a map containing the suggested transform definition.

  This matches Python AI Service's:
  ai_sdk.create_data_part(data_type=AISDKDataTypes.TRANSFORM_SUGGESTION, version=1, value=suggestion)"
  [suggestion]
  {:type :data
   :data-type transform-suggestion-type
   :data suggestion})

(defn adhoc-viz-part
  "Create an ADHOC_VIZ data part for streaming.
  Value should be a map with :query (dataset query), :link (question URL),
  and optionally :title and :display.

  This matches Python AI Service's:
  ai_sdk.create_data_part(data_type=AISDKDataTypes.ADHOC_VIZ, version=1, value=adhoc_viz_value)"
  [value]
  {:type :data
   :data-type adhoc-viz-type
   :data value})

(defn static-viz-part
  "Create a STATIC_VIZ data part for streaming.
  Value should be a map with :entity_id (int) for the saved question or metric to render.

  This matches Python AI Service's:
  ai_sdk.create_data_part(data_type=AISDKDataTypes.STATIC_VIZ, version=1, value={\"entity_id\": entity_id})"
  [value]
  {:type :data
   :data-type static-viz-type
   :data value})

(defn generated-entity-part
  "Create a GENERATED_ENTITY data part for streaming. `entity` is a map describing
  a generated card (see the FE `GeneratedEntity` type): a titled visualization over
  a referenced query, with that query embedded so the FE can run and render it."
  [entity]
  {:type :data
   :data-type generated-entity-type
   :data entity})

(defn entity-saved-part
  "Create an ENTITY_SAVED data part for streaming. `value` is a map describing where a
  previously-generated inline chart was persisted: `{:chart_id <generated chart id>,
  :card_id <saved card id>, :destination {:type :id}}`. The FE resolves the card's
  and the destination's display names at render time."
  [value]
  {:type :data
   :data-type entity-saved-type
   :data value})

(defn search-results-part
  "Data part carrying a search tool's hit list (`:total_count` + `:results`),
  rendered under the search step in the chain of thought."
  [value]
  {:type :data
   :data-type search-results-type
   :data value})

(defn viz-part
  "Return the `generated_entity` card data part that surfaces a query/chart result
  to the frontend. Embeds the (legacy) `query` so the FE runs and renders the card
  in the conversation. The caller must supply a distinct `entity-id` (card id) and
  `query-id`, plus a `title`; `display` and `description` are included when present."
  [{:keys [entity-id query-id query display title description]}]
  (generated-entity-part
   (cond-> {:type  "card"
            :id    entity-id
            :title title
            :query {:id query-id :query query}}
     display     (assoc :display (some-> display name))
     description (assoc :description description))))

(defn dashboard-entity-part
  "Return a `generated_entity` dashboard data part. `url` is the navigation path the
  FE will route to (e.g. `/auto/dashboard/table/123`), `title` is a short human label
  for the inline link card, and `id` is an optional entity id."
  [{:keys [id title url]}]
  (generated-entity-part
   (cond-> {:type "dashboard" :url url :title title}
     id (assoc :id id))))

;;; Stream Processing Transducers

(def expand-data-parts-xf
  "Stateless transducer that appends a tool-output's :data-parts after it, passing
  everything else through. Every object-shaped payload is stamped with its originating
  tool-call id, so the client can render it under the matching chain-of-thought step
  and the source stays traceable when debugging. Array payloads (e.g. todo_list) carry
  no keyed slot, so they're left as-is."
  (mapcat (fn [part]
            (if (= (:type part) :tool-output)
              (cons part (for [dp (get-in part [:result :data-parts])]
                           (cond-> dp
                             (map? (:data dp)) (assoc-in [:data :tool_call_id] (:id part)))))
              [part]))))

(defn post-process-xf
  "Composed transducer for post-processing agent output.

  Applies in order:
  1. expand-data-parts-xf - Extract data-parts from tool outputs
  2. resolve-links-xf - Resolve metabase:// links in text parts

  Parameters:
  - initial-queries: Initial map of query-id to query data
  - initial-charts: Initial map of chart-id to chart data
  - link-registry-atom: Atom of {resolved-url original-metabase-uri}"
  [initial-queries initial-charts link-registry-atom]
  (comp
   expand-data-parts-xf
   (markdown-link-buffer/resolve-xf initial-queries initial-charts link-registry-atom)))
