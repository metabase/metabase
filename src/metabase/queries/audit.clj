(ns metabase.queries.audit
  "What the audit spec of a Card needs beyond its columns."
  (:require
   [clojure.set :as set]
   [metabase.audit-app.core :as audit]
   [metabase.util.events :as u.events]))

(set! *warn-on-reflection* true)

(defn details
  "The details to store for the Card `row` beside its columns: whether it is a model, as people call what the product
  calls a dataset."
  [{card-type :type} _event]
  {:model? (= (keyword card-type) :model)})

(defn- archive-only?
  "Whether the update `event` of a Card changes nothing but whether it is archived, directly."
  [event]
  (let [changed (set/difference (u.events/changed-keys event) (audit/skipped-columns :model/Card))]
    (and (contains? changed :archived)
         (set/subset? changed #{:archived :archived_directly}))))

(defn update-topic
  "The topic to store for the update `event` of a Card, nil for the archive or the restore of it."
  [event]
  (when-not (archive-only? event)
    :card-update))

(defn public-link-created?
  "Whether the `event` of a write of a Card gives it a public link."
  [{:keys [object] :as event}]
  (and (u.events/changed? event :public_uuid)
       (some? (:public_uuid object))))

(defn public-link-deleted?
  "Whether the `event` of a write of a Card takes its public link away."
  [{:keys [object] :as event}]
  (and (u.events/changed? event :public_uuid)
       (nil? (:public_uuid object))))
