(ns metabase-enterprise.library-branching.format.old.action
  "The old format of the kind `:action`: a file of the serdes model Action, with its query row under `query` or its
  implicit row under `implicit`. The place of an action with a model is the model; its `collection_id`, the
  collection of the model, is no attribute. The database of the query row is derived from the query."
  (:require
   [metabase-enterprise.library-branching.format.old.common :as common]))

(set! *warn-on-reflection* true)

(def ^:private attribute-keys
  "The action columns that are attributes, by the same names."
  [:name :description :type :parameters :parameter_mappings])

(defn decode
  "`{:doc d}` of action document `doc`, or `{:skip :archived :id id}` for an action in the trash."
  [doc _opts]
  (let [id    (:entity_id doc)
        model (:model_id doc)]
    (if (common/archived? doc)
      {:skip :archived :id id}
      {:doc (common/item-doc :action id
                             (merge (select-keys doc attribute-keys)
                                    {:model                  model
                                     :collection             (when-not model (:collection_id doc))
                                     ;; The export writes `column_settings: null`; an instance holds no nil setting.
                                     :visualization_settings (some-> (:visualization_settings doc) common/present)}
                                    (case (:type doc)
                                      "query"    {:dataset_query (:dataset_query (first (:query doc)))}
                                      "implicit" {:implicit_kind (:kind (first (:implicit doc)))}
                                      nil)))})))
