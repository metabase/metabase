(ns metabase.documents.prose-mirror
  "Manipulate the prose mirror ast for documents"
  (:require
   [clojure.walk :as walk]
   [metabase.util.malli.registry :as mr]))

(mr/def ::ast
  "A prose-mirror document AST as it arrives at the API. Normalized to keyword keys, the same form the app-DB
  `:document` column transform yields."
  [:map
   {:decode/normalize (fn [ast]
                        (cond-> ast
                          (map? ast) walk/keywordize-keys))
    :closed           false}
   [:type :string]])

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

(defn node-entity-id
  "The referenced entity id carried by a `smartLink` (`:entityId`) or `cardEmbed` (`:id`) node, or nil.

   Returning the id only when it is a positive integer keeps any downstream Toucan lookup parameterized."
  [{:keys [type attrs]}]
  (let [id (if (= smart-link-type type) (:entityId attrs) (:id attrs))]
    (when (pos-int? id)
      id)))

(defn card-ids
  "Get all card-ids"
  [document]
  (collect-ast document #(when (and (= card-embed-type (:type %))
                                    (pos-int? (-> % :attrs :id)))
                           (-> % :attrs :id))))
