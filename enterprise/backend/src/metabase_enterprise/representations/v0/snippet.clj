(ns metabase-enterprise.representations.v0.snippet
  (:require
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.lib.core :as lib]
   [metabase.util :as u]))

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
