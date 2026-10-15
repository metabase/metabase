(ns metabase-enterprise.library-branching.instance.kinds.snippet
  "The app DB side of the kind `:snippet`, in the item form of `format.kinds.snippet`. `:template_tags` is the portable
  form of the tag map: a snippet reference holds the identity of its snippet. Not content: the archive column (scope)
  and the bookkeeping columns."
  (:require
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.format.kinds.snippet :as format.snippet]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.content :as content]
   [metabase-enterprise.library-branching.instance.portable :as portable]
   [metabase.models.serialization :as serdes]))

(set! *warn-on-reflection* true)

(defn attrs
  "The attributes of `snippet`, with none at its default."
  [snippet]
  (->> (-> (select-keys snippet [:content :description])
           (assoc :template_tags (serdes/export-mbql (:template_tags snippet))))
       portable/document
       (content/attrs format.snippet/spec)))

(defn- portable-content
  [snippet]
  {:place (serdes/*export-fk* (:collection_id snippet) :model/Collection)
   :attrs (attrs snippet)})

(defn read-snippets
  "`{entity-id item}` of the snippets of `entity-ids`."
  [entity-ids]
  (let [snippets (content/in-chunks library-branching.db/snippets-by-entity-id (vec entity-ids))
        contents (portable/export-batch portable-content snippets)]
    (into {}
          (map (fn [{:keys [entity_id name]} {:keys [place attrs]}]
                 [entity_id (content/item :snippet entity_id name place attrs)])
               snippets
               contents))))

(def kind-store
  "The `KindStore` of snippets."
  (reify instance/KindStore
    (read-all [_ ids] (read-snippets ids))
    (current [_ _id] (instance/not-yet! `instance/current))
    (write! [_ _content] (instance/not-yet! `instance/write!))
    (trash! [_ _id] (instance/not-yet! `instance/trash!))))
