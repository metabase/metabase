(ns metabase.documents.collab.persistence
  "YHocuspocus `DatabaseExtension` backed by the `document.ydoc` column.

   Writes the binary Y-CRDT state but deliberately skips the `:model/Document`
   `define-after-update` hook, which syncs associated cards on every update —
   unnecessary (and expensive) for ydoc-only writes that fire every few seconds
   during active editing. The `:event/document-update` event is re-emitted
   here explicitly so downstream consumers still observe the change."
  (:require
   [clojure.string :as str]
   [metabase.events.core :as events]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (net.carcdr.yhocuspocus.extension DatabaseExtension)))

(set! *warn-on-reflection* true)

(def ^:private document-prefix "document:")

(defn parse-doc-name
  "Parse a yhocuspocus document name like `document:<entity-id>` into
   `{:type :document :entity-id ...}`. Throws `ex-info` for unknown prefixes
   so new protocols (future `card:<id>`, etc.) surface explicitly."
  [s]
  (cond
    (or (nil? s) (not (string? s)) (str/blank? s))
    (throw (ex-info "document name is required"
                    {:doc-name s}))

    (str/starts-with? s document-prefix)
    {:type :document, :entity-id (subs s (count document-prefix))}

    :else
    (throw (ex-info "unsupported document name prefix"
                    {:doc-name s :known-prefixes #{document-prefix}}))))

(defn- load-snapshot [entity-id]
  (t2/select-one-fn :ydoc :model/Document :entity_id entity-id))

(defn- save-snapshot! [entity-id ^bytes state-bytes]
  (t2/query-one {:update :document
                 :set    {:ydoc       state-bytes
                          :updated_at :%now}
                 :where  [:= :entity_id entity-id]})
  (when-let [doc (t2/select-one :model/Document :entity_id entity-id)]
    (events/publish-event! :event/document-update {:object doc})))

(defn create-persistence-extension
  "Build a `DatabaseExtension` proxy that yhocuspocus calls to load and save
   Y-CRDT state. yhocuspocus runs these on its executor; blocking is safe."
  ^DatabaseExtension []
  (proxy [DatabaseExtension] []
    (loadFromDatabase [^String doc-name]
      (try
        (let [{:keys [entity-id]} (parse-doc-name doc-name)]
          (load-snapshot entity-id))
        (catch Throwable t
          (log/warnf t "collab: loadFromDatabase failed for %s" doc-name)
          (throw t))))
    (saveToDatabase [^String doc-name ^bytes state]
      (try
        (let [{:keys [entity-id]} (parse-doc-name doc-name)]
          (save-snapshot! entity-id state))
        (catch Throwable t
          (log/warnf t "collab: saveToDatabase failed for %s" doc-name)
          (throw t))))))
