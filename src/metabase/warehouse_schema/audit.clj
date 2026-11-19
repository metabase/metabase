(ns metabase.warehouse-schema.audit
  "What the audit spec of a Table needs beyond its columns."
  (:require
   [metabase.util.events :as u.events]
   [metabase.warehouse-schema.db :as warehouse-schema.db]))

(set! *warn-on-reflection* true)

(defn published?
  "Whether the `event` of a write of a Table publishes it."
  [{:keys [object] :as event}]
  (and (u.events/changed? event :is_published)
       (true? (:is_published object))))

(defn unpublished?
  "Whether the update `event` of a Table takes it back from publication."
  [{:keys [object previous-object] :as event}]
  (and (u.events/changed? event :is_published)
       (not (true? (:is_published object)))
       (some? previous-object)))

(defn moment-details
  "The details to store for the `event` of a publication of a Table."
  [{:keys [object]}]
  (select-keys object [:id :name :db_id]))

(defn settings-subject
  "The Table under which the row of the `event` of a write of its user settings is recorded."
  [{:keys [object previous-object]}]
  [:model/Table (:table_id (or object previous-object))])

(defn settings-moment-details
  "The details to store for the `event` of a publication of a Table through its user settings."
  [{:keys [object]}]
  (select-keys (warehouse-schema.db/table (:table_id object)) [:id :name :db_id]))
