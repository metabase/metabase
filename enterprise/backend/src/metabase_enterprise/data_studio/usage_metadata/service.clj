(ns metabase-enterprise.data-studio.usage-metadata.service
  "Domain operations for reviewing and acting on persisted usage-metadata recommendations."
  (:require
   [metabase.measures.create :as measures.create]
   [metabase.models.interface :as mi]
   [metabase.segments.create :as segments.create]
   [metabase.usage-metadata.candidate-refresh :as candidate-refresh]
   [metabase.usage-metadata.candidate-repository :as candidate-repository]))

(set! *warn-on-reflection* true)

(defn conflict!
  "Throw a 409 conflict ex-info with `reason` (and any extra `data`) attached."
  [message reason & [data]]
  (throw (ex-info message (merge {:status-code 409, :reason reason} data))))

(defn current-candidate
  "Return the current candidate for `id`, or nil when it does not exist.

  An obsolete candidate is a conflict rather than a missing resource because callers need to refresh their snapshot."
  [id]
  (when-let [candidate (candidate-repository/candidate id)]
    (when-not (candidate-refresh/candidate-current? candidate)
      (conflict! "Candidate belongs to an obsolete snapshot" :obsolete-snapshot))
    candidate))

(defn- candidate-entity-model
  [candidate]
  (case (:candidate_type candidate)
    :measure :model/Measure
    :segment :model/Segment
    nil))

(defn- table-editable-for-candidate?
  [candidate table]
  (when-let [model (candidate-entity-model candidate)]
    (mi/can-create? model {:table table, :table_id (:id table)})))

(defn creation-blockers
  "Return the reasons that prevent direct creation of `candidate` on `table`."
  [candidate table]
  (if-not (candidate-entity-model candidate)
    [:unsupported-candidate-type]
    (cond-> []
      (not (:is_published table))
      (conj :table-not-published)

      (not (:active table))
      (conj :table-inactive)

      (not (table-editable-for-candidate? candidate table))
      (conj :table-uneditable))))

(defn dismiss!
  "Dismiss `candidate` for the instance."
  [candidate user-id]
  (candidate-repository/dismiss! candidate user-id))

(defn restore!
  "Restore a previously dismissed `candidate`."
  [candidate]
  (candidate-repository/restore! candidate))

(defn- create-current!
  [candidate {:keys [name description] :as overrides}]
  (let [table (candidate-repository/candidate-table candidate)]
    (when-not table
      (throw (ex-info "Candidate table does not exist" {:status-code 404})))
    (let [blockers (set (creation-blockers candidate table))]
      (cond
        (contains? blockers :table-inactive)
        (conflict! "Candidate table is inactive" :table-inactive)

        (contains? blockers :table-not-published)
        (conflict! "Candidate table is not published in the Library" :table-not-published)

        (contains? blockers :table-uneditable)
        (conflict! "Candidate table cannot be edited" :table-uneditable)))
    (if-let [existing (candidate-repository/exact-existing-entity candidate)]
      (candidate-repository/mark-modeled! candidate existing)
      (let [body   {:name        (or name (:suggested_name candidate))
                    :description (if (contains? overrides :description)
                                   description
                                   (:suggested_description candidate))
                    :definition  (:definition candidate)}
            entity (case (:candidate_type candidate)
                     :measure (measures.create/create! body)
                     :segment (segments.create/create! body)
                     (throw (ex-info "Unsupported candidate type" {:candidate-type (:candidate_type candidate)})))]
        (candidate-repository/mark-modeled! candidate entity)))))

(defn create!
  "Create or return the exact Measure or Segment represented by the current candidate snapshot."
  [candidate overrides]
  (when-not (candidate-entity-model candidate)
    (conflict! "This recommendation does not support direct creation" :unsupported-candidate-action))
  (candidate-repository/with-snapshot-action-lock
    #(if-let [current (current-candidate (:id candidate))]
       (create-current! current overrides)
       (conflict! "Candidate no longer belongs to the current snapshot" :obsolete-snapshot))))
