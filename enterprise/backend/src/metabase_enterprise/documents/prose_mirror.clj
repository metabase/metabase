(ns metabase-enterprise.documents.prose-mirror
  "Manipulate the prose mirror ast for documents"
  (:require
   [clojure.walk :as walk]))

(def card-embed-type
  "Type of a card-embed node"
  "cardEmbed")

(def prose-mirror-content-type
  "The vendored 'mime-type' for documents saved using the prose-mirror ast."
  "application/json+vnd.prose-mirror")

(defn update-ast
  "Update a node that matches a predicate using a post-walk.

  Args:
  - document - a :model/Document, this will check that content type is valid for prose mirror
  - predicate - a one-arg function returning true a given node should be updated
  - updater - a one-arg function taking the node and return the new node

  Returns:
  - the updated prose-mirror ast"
  [{:keys [document content_type] :as doc} predicate updater]
  (when-not (= content_type prose-mirror-content-type)
    (throw (ex-info "Document does not have the prose mirror content-type"
                    {:content-type content_type
                     :status-code 400})))
  (assoc doc :document
         (walk/postwalk (fn ast-walker
                          [node]
                          (cond-> node
                            (predicate node) updater))
                        document)))
