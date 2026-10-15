(ns metabase-enterprise.library-branching.format.old.collection
  "The old format of the kind `:collection`: a file of the serdes model Collection."
  (:require
   [metabase-enterprise.library-branching.format.old.common :as common]
   [metabase-enterprise.library-branching.snapshot :as snapshot]))

(set! *warn-on-reflection* true)

(def ^:private scope-markers
  "Collection types of the old format that marked a collection as synced. Scope is fixed, so they mean nothing."
  ;; v57 wrote `type: remote-synced`; later versions write the flag `is_remote_synced`, which is no attribute.
  #{"remote-synced"})

(defn- namespace-root
  "The area root of the namespace `ns-name`, the place of a collection of that namespace with no parent; nil for no
  namespace, or one with no area."
  [ns-name]
  (when (string? ns-name)
    (snapshot/area-root (keyword ns-name))))

(defn decode
  "`{:doc d}` of collection document `doc`, or `{:skip :archived :id id}` for a collection in the trash. A collection
  of a namespace with no parent is at the root of the namespace's area."
  [doc _opts]
  (let [id (:entity_id doc)]
    (if (common/archived? doc)
      {:skip :archived :id id}
      {:doc (common/item-doc :collection id
                             {:name            (:name doc)
                              :parent          (or (:parent_id doc) (namespace-root (:namespace doc)))
                              :description     (:description doc)
                              :type            (when-not (contains? scope-markers (:type doc)) (:type doc))
                              :namespace       (:namespace doc)
                              :authority_level (:authority_level doc)})})))
