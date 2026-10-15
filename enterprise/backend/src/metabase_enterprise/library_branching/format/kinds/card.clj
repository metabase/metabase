(ns metabase-enterprise.library-branching.format.kinds.card
  "What the codecs of the card kinds share (`:metric`, `:question`, `:model`): a card of one type, as the file
  `<name>.<word>.yaml`. The place is the collection, under `collection`. The query is MBQL 5 in its portable JSON
  form; the file omits the `:lib/type` keys that the query's structure implies."
  (:require
   [metabase-enterprise.library-branching.format.kinds.common :as common]
   [metabase-enterprise.library-branching.format.kinds.portable :as portable]
   [metabase-enterprise.library-branching.format.kinds.visualization :as visualization]
   [metabase-enterprise.library-branching.registry :as registry]
   [metabase-enterprise.library-branching.snapshot :as snapshot]))

(set! *warn-on-reflection* true)

(registry/def ::query
  [:and
   [:map
    [:database :string]
    [:stages [:vector {:min 1} [:map-of :keyword :any]]]]
   [:fn {:error/message "every stage and join of the query has its :lib/type"} portable/implied-keys?]])

(defn home
  "A root-level card, which a well-formed snapshot never has, is in `library/`."
  [_item]
  {:dir ["library"]})

(def ^:private item-attrs
  "Attributes whose value is the entity id of an item, with the role of the reference."
  {:dashboard_id :dashboard
   :document_id  :document})

(defn- column-refs
  "The references of the column `col` of the result metadata of a model: its field reference, and the field, the table
  and the target field that it names by natural key."
  [col]
  (if (map? col)
    (let [{:keys [field_ref id table_id fk_target_field_id]} col]
      (cond-> (portable/refs field_ref)
        (vector? id)                 (conj [:field [:env id]])
        (vector? fk_target_field_id) (conj [:field [:env fk_target_field_id]])
        (vector? table_id)           (conj [:table [:env table_id]])))
    #{}))

(defn refs
  "The references of a card: of its query, of its visualization settings, of the dashboard or document that holds it,
  of the columns of its result metadata, and of the other attributes that hold portable references (parameters,
  parameter mappings, dimensions)."
  [_id attrs]
  (-> (portable/query-refs (:query attrs))
      (into (visualization/refs (:visualization_settings attrs)))
      (into (keep (fn [[k role]] (when-some [v (get attrs k)] [role v]))) item-attrs)
      (into (mapcat column-refs) (when (sequential? (:result_metadata attrs)) (:result_metadata attrs)))
      (into (portable/refs (apply dissoc attrs :query :visualization_settings :result_metadata (keys item-attrs))))))

(defn encode-attrs
  "The attributes as the file holds them: the query without its implied keys."
  [attrs]
  (cond-> attrs
    (contains? attrs :query) (update :query portable/omit-implied)))

(defn decode-attrs
  "The inverse of [[encode-attrs]]."
  [attrs]
  (cond-> attrs
    (contains? attrs :query) (update :query portable/restore-implied)))

(def attrs
  "The attributes of every card kind."
  {:description            {:schema :string}
   :display                {:schema [:string {:min 1}] :required? true}
   :query                  {:schema ::query :required? true}
   :visualization_settings {:schema ::common/document-map :default {}}
   :parameters             {:schema ::common/document-vector :default []}
   :parameter_mappings     {:schema ::common/document-vector :default []}
   :collection_position    {:schema :int}
   :collection_preview     {:schema :boolean :default true}})

(defn spec
  "The codec spec of the card kind `kind`, whose word is `word`, with the attributes of [[attrs]] and `more`."
  [kind word more]
  {:kind         kind
   :word         word
   :directory?   false
   :home         #'home
   :id-schema    ::snapshot/entity-id
   :name-key     :name
   :place-key    :collection
   :attrs        (merge attrs more)
   :encode-attrs #'encode-attrs
   :decode-attrs #'decode-attrs
   :refs         #'refs})
