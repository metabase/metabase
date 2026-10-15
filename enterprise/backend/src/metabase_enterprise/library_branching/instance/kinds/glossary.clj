(ns metabase-enterprise.library-branching.instance.kinds.glossary
  "The app DB side of the kind `:glossary-term`, in the item form of `format.kinds.glossary`: the term is the name, the
  place is the root of the Glossary area, and the definition is the one attribute. Not content: the creator and the
  bookkeeping columns. Metabase has no trash for glossary terms, so `trash!` deletes the term."
  (:require
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.format.kinds.glossary :as format.glossary]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.content :as content]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase.api.common :as api]
   [metabase.config.core :as config]))

(set! *warn-on-reflection* true)

(defn- term-item
  [{:keys [entity_id term definition]}]
  (content/item :glossary-term entity_id term (:fixed-place format.glossary/spec)
                (content/attrs format.glossary/spec {:definition definition})))

(defn read-glossary-terms
  "`{entity-id item}` of the glossary terms of `entity-ids`."
  [entity-ids]
  (into {}
        (map (juxt :entity_id term-item))
        (content/in-chunks library-branching.db/glossary-terms-by-entity-id (vec entity-ids))))

(defn current-glossary-term
  "The content of the in-scope glossary term `id`, after a lock on its row, or nil."
  [id]
  (when-let [row (library-branching.db/lock-glossary-term id)]
    (when (scope/in-scope? :glossary-term id)
      (term-item row))))

(defn- check-term-free!
  "Throws ::instance/refused when a glossary term with an identity other than `id` has the term `term`: Metabase keeps
  each term once."
  [id term]
  (when-let [other (library-branching.db/glossary-term-by-term term)]
    (when (not= id (:entity_id other))
      (instance/refuse! :name-taken id (str "Another glossary term has the term " (pr-str term) ".")
                        {:other (:entity_id other)}))))

(defn write-glossary-term!
  "Makes the content of glossary term `id` equal to `item`, by the contract of `instance/write!`. A term that another
  glossary term has refuses the write with the reason `:name-taken`."
  [id {term :name :keys [attrs] :as item}]
  (content/check-item! :glossary-term id item)
  (let [row        (library-branching.db/lock-glossary-term id)
        definition (content/attr-value format.glossary/spec attrs :definition)]
    (check-term-free! id term)
    (if-not row
      (library-branching.db/insert-glossary-term! {:entity_id  id
                                                   :term       term
                                                   :definition definition
                                                   :creator_id (or api/*current-user-id* config/internal-mb-user-id)})
      (let [changes (cond-> {}
                      (not= term (:term row))             (assoc :term term)
                      (not= definition (:definition row)) (assoc :definition definition))]
        (when (seq changes)
          (library-branching.db/update-glossary-term! (:id row) changes))))
    nil))

(defn trash-glossary-term!
  "Deletes glossary term `id`."
  [id]
  (when-let [row (library-branching.db/lock-glossary-term id)]
    (library-branching.db/delete-glossary-term! (:id row))
    nil))

(def kind-store
  "The `KindStore` of glossary terms."
  (reify instance/KindStore
    (read-all [_ ids] (read-glossary-terms ids))
    (read-models [_] #{:model/Glossary})
    (current [_ id] (current-glossary-term id))
    (write! [_ id item] (content/do-in-write-transaction id #(write-glossary-term! id item)))
    (trash! [_ id] (content/do-in-write-transaction id #(trash-glossary-term! id)))))
