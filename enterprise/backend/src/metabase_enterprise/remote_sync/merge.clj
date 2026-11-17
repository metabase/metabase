(ns metabase-enterprise.remote-sync.merge
  "The three-way merge of the documents of the last synced tree (base), of the app DB (ours) and of the remote tree
  (theirs), keyed by entity, so that renaming or moving an entity is a change to it rather than a delete and an add."
  (:require
   [metabase-enterprise.remote-sync.content :as content]
   [metabase.remote-sync.core :as remote-sync]))

(set! *warn-on-reflection* true)

(defn label
  "The name of the entity of `key` for people, from whichever of `docs` has it."
  [key & docs]
  (let [[model ref] key]
    (or (some #(some->> (:entity %) (remote-sync/synced-name model)) docs)
        (if (sequential? ref) (str (last ref)) (str (name model) " " ref)))))

(defn merge-documents
  "The merge of `ours` and `theirs`, maps from key to document, since `base`, the documents of the tree the app DB last
  synced with: `:merged`, the documents to keep; `:conflicts`, the labels of the entities both sides changed
  differently; `:summary`, the counts of their changes merged in; and `:casualties`, the labels of their changes that
  taking ours instead would discard."
  [base ours theirs]
  (reduce (fn [acc k]
            (let [b       (get base k)
                  o       (get ours k)
                  t       (get theirs k)
                  ours?   (not (content/same? o b))
                  theirs? (not (content/same? t b))
                  kept    (cond
                            (not theirs?) o
                            (not ours?)   t
                            (content/same? o t)   o)]
              (cond-> acc
                kept
                (assoc-in [:merged k] kept)

                (and ours? theirs? (not (content/same? o t)))
                (update :conflicts conj (label k o t))

                (and theirs? (not ours?))
                (update-in [:summary (cond (nil? b) :added (nil? t) :removed :else :updated)] inc)

                (and theirs? (not (content/same? o t)))
                (update-in [:casualties (if o :overwritten :deleted)] conj (label k t b)))))
          {:merged     {}
           :conflicts  []
           :summary    {:added 0 :updated 0 :removed 0}
           :casualties {:deleted [] :overwritten []}}
          (into (set (keys base)) (concat (keys ours) (keys theirs)))))
