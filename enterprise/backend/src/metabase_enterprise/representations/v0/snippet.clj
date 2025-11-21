(ns metabase-enterprise.representations.v0.snippet
  (:require
   [metabase-enterprise.representations.toucan.core :as rep-t2]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.lib.core :as lib]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defmethod v0-common/representation-type :model/NativeQuerySnippet [_entity]
  :snippet)

(def toucan-model
  "The toucan model keyword associated with snippet representations"
  :model/NativeQuerySnippet)

(defn yaml->toucan
  "Convert a v0 snippet representation to Toucan-compatible data."
  [{:keys [name display_name description sql collection]}
   _ref-index]
  (-> {:name (or display_name name)
       :description description
       :content sql
       :collection_id (v0-common/find-collection-id collection)
       :template_tags (lib/recognize-template-tags sql)}
      u/remove-nils))

(defn persist!
  "Persist a v0 snippet representation by creating or updating it in the database."
  [representation ref-index]
  (let [snippet-data (->> (yaml->toucan representation ref-index)
                          (rep-t2/with-toucan-defaults :model/NativeQuerySnippet))
        entity-id (:entity_id snippet-data)
        existing (when entity-id (t2/select-one :model/NativeQuerySnippet :entity_id entity-id))]
    (if existing
      (do
        (log/info "Updating existing snippet" (:name snippet-data) "with name" (:name representation))
        (t2/update! :model/NativeQuerySnippet (:id existing) (dissoc snippet-data :entity_id))
        (t2/select-one :model/NativeQuerySnippet :id (:id existing)))
      (do
        (log/info "Creating new snippet" (:name snippet-data))
        (first (t2/insert-returning-instances! :model/NativeQuerySnippet snippet-data))))))

(defn- template-tag-ref
  "Given a template tag map, return its ref string."
  [template-tag]
  (case (:type template-tag)
    :snippet (v0-common/->ref (:snippet-id template-tag) :snippet)
    :card (v0-common/->ref (:card-id template-tag) :card)
    (throw (ex-info (str "Unknown template tag type " (:type template-tag))
                    {:template-tag template-tag}))))

(defn export-snippet
  "Export a NativeQuerySnippet Toucan entity to a v0 snippet representation."
  [snippet]
  (let [snippet-ref (v0-common/unref (v0-common/->ref (:id snippet) :snippet))
        template-tags (into {}
                            (comp
                             (filter (fn [[_ v]] (not= (:type v) :text)))
                             (map (fn [[k v]] [k (template-tag-ref v)])))
                            (:template_tags snippet))]
    {:name snippet-ref
     :type :snippet
     :version :v0
     :display_name (:name snippet)
     :description (:description snippet)
     :sql (:content snippet)
     :template_tags template-tags}))
