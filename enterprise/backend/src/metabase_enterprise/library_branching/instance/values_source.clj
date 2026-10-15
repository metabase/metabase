(ns metabase-enterprise.library-branching.instance.values-source
  "Parameters outside the Library tree whose values come from a Library card. The Card save path clears the values
  source of every parameter that takes its values from a card that goes to the trash. An apply changes no content
  outside the Library tree, so a trash keeps the values sources of the parameters outside it."
  (:require
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.instance.tree :as tree]))

(set! *warn-on-reflection* true)

(defn do-keeping-outside-values-sources
  "Calls `f` with no arguments in a transaction and returns its result. `users` are the ParameterCard rows, each with
  `:user_collection_id`, of the cards that `f` can move to the trash. For each user outside the Library tree, `f`
  leaves its card or dashboard row and its ParameterCard row as they were. The values source of a parameter of content
  in the Library tree follows the save path of `f`."
  [users f]
  (library-branching.db/do-in-transaction
   (fn []
     (let [in-tree? (memoize tree/collection-id-in-tree?)
           outside  (into [] (comp (remove (comp in-tree? :user_collection_id))
                                   (map #(dissoc % :user_collection_id)))
                          users)]
       ;; The Card save path finds the parameters to clear through the ParameterCard rows of the card. Without the
       ;; rows of the users outside the tree, it changes none of them; the rows come back, ids included, before the
       ;; transaction ends.
       (doseq [chunk (partition-all 1000 outside)]
         (library-branching.db/delete-parameter-cards! (mapv :id chunk)))
       (let [result (f)]
         (doseq [chunk (partition-all 1000 outside)]
           (library-branching.db/insert-parameter-cards! (vec chunk)))
         result)))))
