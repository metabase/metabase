(ns metabase.documents.audit
  "What the audit spec of a Document needs beyond its columns: the topics of its writes, which an Exploration's
  Document, a page that no one lists, does not record."
  (:require
   [metabase.util.events :as u.events]))

(set! *warn-on-reflection* true)

(defn- exploration?
  "Whether the lifecycle `event` is a write of the Document of an Exploration."
  [{:keys [object previous-object]}]
  (some? (:exploration_id (or object previous-object))))

(defn create-topic
  "The topic to store for the creation `event` of a Document, nil for that of an Exploration."
  [event]
  (when-not (exploration? event)
    :document-create))

(defn update-topic
  "The topic to store for the update `event` of a Document, which is the deletion of it when it archives it, nil for that
  of an Exploration."
  [{:keys [object] :as event}]
  (cond
    (exploration? event)                                       nil
    (and (true? (:archived object)) (u.events/changed? event :archived)) :document-delete
    :else                                                      :document-update))

(defn delete-topic
  "The topic to store for the deletion `event` of a Document, nil for that of an Exploration."
  [event]
  (when-not (exploration? event)
    :document-delete))
