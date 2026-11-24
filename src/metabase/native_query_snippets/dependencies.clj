(ns metabase.native-query-snippets.dependencies
  "The functions of the dependencies spec of a NativeQuerySnippet."
  (:require
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private tag-id-keys
  "The key of the id that a template tag of each type that is a dependency names."
  {:card :card-id, :snippet :snippet-id})

(defn dependencies
  "The dependencies of `snippet`: the cards and snippets its template tags name."
  [{:keys [template_tags]}]
  (u/group-by first second conj #{}
              (keep (fn [{entity-type :type, :as tag}]
                      (when-let [entity-id (some-> (tag-id-keys entity-type) tag)]
                        [entity-type entity-id]))
                    (vals template_tags))))
