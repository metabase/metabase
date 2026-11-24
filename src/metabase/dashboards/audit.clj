(ns metabase.dashboards.audit
  "What the audit spec of a Dashboard needs beyond its columns."
  (:require
   [metabase.util.events :as u.events]))

(set! *warn-on-reflection* true)

(defn public-link-created?
  "Whether the `event` of a write of a Dashboard gives it a public link."
  [{:keys [object] :as event}]
  (and (u.events/changed? event :public_uuid)
       (some? (:public_uuid object))))

(defn public-link-deleted?
  "Whether the `event` of a write of a Dashboard takes its public link away."
  [{:keys [object] :as event}]
  (and (u.events/changed? event :public_uuid)
       (nil? (:public_uuid object))))
