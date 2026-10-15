(ns metabase-enterprise.library-branching.format.old.collection
  "The old format of the kind `:collection`: a file of the serdes model Collection."
  (:require
   [metabase-enterprise.library-branching.format.old.common :as common]))

(set! *warn-on-reflection* true)

(def ^:private scope-markers
  "Collection types of the old format that marked a collection as synced. Scope is fixed, so they mean nothing."
  ;; v57 wrote `type: remote-synced`; later versions write the flag `is_remote_synced`, which is no attribute.
  #{"remote-synced"})

(defn decode
  "`{:doc d}` of collection document `doc`, or `{:skip :archived :id id}` for a collection in the trash."
  [doc _opts]
  (let [id (:entity_id doc)]
    (if (common/archived? doc)
      {:skip :archived :id id}
      {:doc (common/item-doc :collection id
                             {:name            (:name doc)
                              :parent          (:parent_id doc)
                              :description     (:description doc)
                              :type            (when-not (contains? scope-markers (:type doc)) (:type doc))
                              :namespace       (:namespace doc)
                              :authority_level (:authority_level doc)})})))
