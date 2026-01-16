(ns metabase-enterprise.metabot-v3.agent.streaming
  "Streaming helpers for the agent loop.
  Provides utilities for creating AI-SDK data parts, including navigation."
  (:require
   [buddy.core.codecs :as codecs]
   [metabase.lib.core :as lib]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

;;; AI-SDK Data Types
;;
;; These match the Python AI Service's AISDKDataTypes enum

(def navigate-to-type "navigate_to")
(def state-type "state")
(def todo-list-type "todo_list")
(def code-edit-type "code_edit")
(def transform-suggestion-type "transform_suggestion")

;;; Query URL Encoding

(defn query->url-hash
  "Convert an MLv2/MBQL query to a base64-encoded URL hash.
  Used for /question# URLs."
  [query]
  (let [;; Normalize MLv2 query to legacy MBQL format for URL
        dataset-query (if (and (map? query) (:lib/type query))
                        (lib/->legacy-MBQL query)
                        query)]
    (-> {:dataset_query dataset-query}
        json/encode
        (.getBytes "UTF-8")
        codecs/bytes->b64-str)))

(defn query->question-url
  "Convert a query to a /question# URL."
  [query]
  (str "/question#" (query->url-hash query)))

;;; Data Part Constructors

(defn navigate-to-part
  "Create a NAVIGATE_TO data part for streaming.
  The URL should be a path like '/question#...' or '/model/123'.

  This matches Python AI Service's:
  ai_sdk.create_data_part(data_type=AISDKDataTypes.NAVIGATE_TO, version=1, value=path)"
  [url]
  {:type :data
   :data-type navigate-to-type
   :data url})

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
   :version 1
   :data todos})

(defn code-edit-part
  "Create a CODE_EDIT data part for streaming.
  Edit-data should be a map describing the code edit operation.

  This matches Python AI Service's:
  ai_sdk.create_data_part(data_type=AISDKDataTypes.CODE_EDIT, version=1, value=edit_data)"
  [edit-data]
  {:type :data
   :data-type code-edit-type
   :version 1
   :data edit-data})

(defn transform-suggestion-part
  "Create a TRANSFORM_SUGGESTION data part for streaming.
  Suggestion should be a map containing the suggested transform definition.

  This matches Python AI Service's:
  ai_sdk.create_data_part(data_type=AISDKDataTypes.TRANSFORM_SUGGESTION, version=1, value=suggestion)"
  [suggestion]
  {:type :data
   :data-type transform-suggestion-type
   :version 1
   :data suggestion})

;;; Reaction Conversion

(defn reactions->data-parts
  "Convert tool reactions to AI-SDK data parts for streaming.

  Reactions are metadata returned by tools that trigger side effects:
  - :metabot.reaction/redirect -> navigate_to data part

  Returns a vector of data parts (may be empty if no relevant reactions)."
  [reactions]
  (into []
        (keep (fn [{:keys [type url]}]
                (case type
                  :metabot.reaction/redirect (navigate-to-part url)
                  nil)))
        reactions))
