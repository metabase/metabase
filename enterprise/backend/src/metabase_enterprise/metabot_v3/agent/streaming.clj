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
