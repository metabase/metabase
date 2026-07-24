(ns metabase-enterprise.semantic-search.events
  "Event handlers for the semantic-search module."
  (:require
   [metabase-enterprise.semantic-search.core :as semantic.core]
   [metabase.events.core :as events]
   [methodical.core :as methodical]))

(derive :event/semantic-search-hnsw-enabled ::build-hnsw-index)

;; Handled via an event so settings stays decoupled from the index-building code, which requires settings.
(methodical/defmethod events/publish-event! ::build-hnsw-index
  [_topic _event]
  (semantic.core/build-hnsw-index-async!))
