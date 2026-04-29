(ns metabase.agent-lib.runtime.bindings
  "Context-dependent runtime bindings for structured MBQL evaluation."
  (:require
   [metabase.agent-lib.runtime.lookup :as runtime.lookup]
   [metabase.agent-lib.runtime.transforms :as runtime.transforms]
   [metabase.lib.core :as lib]))

(set! *warn-on-reflection* true)

(defn make-context-bindings
  "Build query-aware structured helper bindings for the current runtime context."
  [metadata-provider tables-by-name fields-by-table fields-by-id]
  (merge {'query (fn [metadata] (lib/query metadata-provider metadata))}
         (runtime.lookup/metadata-bindings metadata-provider
                                           tables-by-name
                                           fields-by-table
                                           fields-by-id)
         (runtime.transforms/query-transform-bindings)))
