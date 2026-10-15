(ns metabase-enterprise.library-branching.format.old.card
  "The old format of the cards: a file of the serdes model Card. Its `type` gives the kind of the item: `:metric`,
  `:question` or `:model`. The attributes are those of the kind: the query is the dataset query, and the derived
  values (the result metadata of a card that is not a model), the public link and the embedding settings are not
  attributes."
  (:require
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.old.common :as common]))

(set! *warn-on-reflection* true)

(def ^:private kinds
  {"metric" :metric, "question" :question, "model" :model})

(def ^:private attribute-keys
  "The card columns that are attributes of each kind, by the same names."
  (let [card [:description :display :parameters :parameter_mappings :collection_position :collection_preview]]
    {:metric   (into card [:dimensions :dimension_mappings])
     :question (into card [:dashboard_id :document_id])
     :model    (into card [:result_metadata])}))

(defn decode
  "`{:doc d}` of card document `doc`, or `{:skip :archived :id id}` for a card in the trash."
  [doc _opts]
  (let [id   (:entity_id doc)
        kind (or (get kinds (:type doc))
                 (codec/invalid! (str "The card type is not metric, question or model: " (pr-str (:type doc)))))]
    (if (common/archived? doc)
      {:skip :archived :id id}
      {:doc (common/item-doc kind id
                             (merge (select-keys doc (get attribute-keys kind))
                                    {:name                   (:name doc)
                                     :collection             (:collection_id doc)
                                     :query                  (:dataset_query doc)
                                     ;; The export writes `column_settings: null`; an instance holds no nil setting.
                                     :visualization_settings (some-> (:visualization_settings doc) common/present)}))})))
