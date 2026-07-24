(ns metabase.documents.prose-mirror
  "Manipulate the prose mirror ast for documents"
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]))

(def card-embed-type
  "Type of a card-embed node"
  "cardEmbed")

(def smart-link-type
  "Type of a smart-link node"
  "smartLink")

(def prose-mirror-content-type
  "The vendored 'mime-type' for documents saved using the prose-mirror ast."
  "application/json+vnd.prose-mirror")

(defn- assert-prose-mirror
  "Asserts the content-type is correct for the document or throw"
  [{:keys [content_type]}]
  (when-not (= content_type prose-mirror-content-type)
    (throw (ex-info "Document does not have the prose mirror content-type"
                    {:content-type content_type
                     :status-code 400}))))

(defn update-ast
  "Update a node that matches a predicate using a post-walk.

  Args:
  - document - a :model/Document, this will check that content type is valid for prose mirror
  - predicate - a one-arg function returning true a given node should be updated
  - updater - a one-arg function taking the node and returning the new node

  Returns:
  - the updated prose-mirror ast"
  [{:keys [document] :as doc} predicate updater]
  (assert-prose-mirror doc)
  (assoc doc :document
         (walk/postwalk (fn ast-walker
                          [node]
                          (cond-> node
                            (predicate node) updater))
                        document)))

(defn collect-ast
  "Collect values from the ast lazily removes nils

  Args:
  - document - a :model/Document, this will check that the content-type is valid for prose mirror
  - collector - a function that extracts values from a given node

  Returns:
  - a lazy seq of results from collector"
  [{:keys [document] :as doc} collector]
  (assert-prose-mirror doc)
  (->> (tree-seq :content :content document)
       (keep collector)))

(defn ast->text
  "Extract the concatenated user-visible text from a prose-mirror document AST (the value of a
  document's `:document` field).

  Walks every node, in document order, and joins:
  - the `:text` of `text` nodes, and
  - the `:label` attr of reference nodes (smart links, mentions) — the text the editor actually
    renders in place of the node.

  Nodes that render no inline prose (card embeds, layout containers) contribute nothing.
  Returns a (possibly empty) string."
  [ast]
  (->> (tree-seq :content :content ast)
       (mapcat (juxt :text (comp :label :attrs)))
       (remove str/blank?)
       (str/join " ")))

(defn card-ids
  "Get all card-ids"
  [document]
  (collect-ast document #(when (and (= card-embed-type (:type %))
                                    (pos-int? (-> % :attrs :id)))
                           (-> % :attrs :id))))

(defn insert-card-embed
  "Insert an embed for the card with `card-id` into the document's prose-mirror ast.

  The embed is a `resizeNode`-wrapped `cardEmbed` node, the same shape the document editor
  produces. `index` is a 0-based position among the ast's top-level blocks (0 inserts at the
  very top); a `nil` index appends the embed at the end and out-of-range indexes are clamped.

  Args:
  - doc - a :model/Document, this will check that the content-type is valid for prose mirror
  - card-id - the id of an existing card to embed
  - index - 0-based top-level block position, or nil to append

  Returns:
  - the document with its :document ast updated"
  [{:keys [document] :as doc} card-id index]
  (assert-prose-mirror doc)
  (let [blocks (vec (:content document))
        at     (if (int? index)
                 (-> index (max 0) (min (count blocks)))
                 (count blocks))
        embed  {:type    "resizeNode"
                :content [{:type  card-embed-type
                           :attrs {:id card-id}}]}]
    (assoc doc :document
           (assoc (or document {:type "doc"})
                  :content (into (conj (subvec blocks 0 at) embed) (subvec blocks at))))))
