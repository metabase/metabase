(ns metabase-enterprise.library-branching.format.old.snippet
  "The old format of the kind `:snippet`: a file of the serdes model NativeQuerySnippet."
  (:require
   [metabase-enterprise.library-branching.format.old.common :as common]
   [metabase-enterprise.library-branching.snapshot :as snapshot]))

(set! *warn-on-reflection* true)

(defn decode
  "`{:doc d}` of snippet document `doc`, or `{:skip :archived :id id}` for a snippet in the trash. A snippet with no
  collection is at the root of the Snippets area."
  [doc _opts]
  (let [id (:entity_id doc)]
    (if (common/archived? doc)
      {:skip :archived :id id}
      {:doc (common/item-doc :snippet id (assoc (select-keys doc [:name :description :content :template_tags])
                                                :collection (or (:collection_id doc)
                                                                (snapshot/area-root :snippets))))})))
