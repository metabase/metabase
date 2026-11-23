(ns metabase.documents.dependencies
  "The functions of the dependencies spec of a Document."
  (:require
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private smart-link-models
  "The models of the smart links that are dependencies."
  #{"card" "dashboard" "table" "document"})

(defn- node-dependency
  "The `[entity-type entity-id]` that the prose-mirror node with `type` and `attrs` points at, or nil."
  [{:keys [type attrs]}]
  (cond
    (and (= prose-mirror/smart-link-type type)
         (smart-link-models (:model attrs))
         (pos-int? (:entityId attrs)))
    [(keyword (:model attrs)) (:entityId attrs)]

    (and (= prose-mirror/card-embed-type type)
         (pos-int? (:id attrs)))
    [:card (:id attrs)]))

(defn dependencies
  "The dependencies of `document`: what the smart links and card embeds of a prose-mirror document point at."
  [{:keys [content_type] :as document}]
  (if (= content_type prose-mirror/prose-mirror-content-type)
    (u/group-by first second conj #{} (prose-mirror/collect-ast document node-dependency))
    {}))
