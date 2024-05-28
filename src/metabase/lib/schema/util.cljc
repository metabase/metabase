(ns metabase.lib.schema.util
  (:refer-clojure :exclude [ref])
  (:require
   [metabase.lib.options :as lib.options]
   [metabase.util.malli.registry :as mr]))

(declare collect-uuids)

(defn- collect-uuids-in-map [m]
  (into (if-let [our-uuid (or (:lib/uuid (lib.options/options m))
                              (:lib/uuid m))]
          [our-uuid]
          [])
        (comp (remove (fn [[k _v]]
                        (qualified-keyword? k)))
              (mapcat (fn [[_k v]]
                        (collect-uuids v))))
        m))

(defn- collect-uuids-in-sequence [xs]
  (into [] (mapcat collect-uuids) xs))

(defn collect-uuids
  "Return all the `:lib/uuid`s in a part of an MBQL query (a clause or map) as a sequence. This will be used to ensure
  there are no duplicates."
  [x]
  (cond
    (map? x)        (collect-uuids-in-map x)
    (sequential? x) (collect-uuids-in-sequence x)
    :else           nil))

(defn- find-duplicate-uuid [x]
  (transduce
   identity
   (fn
     ([]
      #{})
     ([result]
      (when (string? result)
        result))
     ([seen a-uuid]
      (if (contains? seen a-uuid)
        (reduced a-uuid)
        (conj seen a-uuid))))
   (collect-uuids x)))

(defn unique-uuids?
  "True if all the `:lib/uuid`s in something are unique."
  [x]
  (not (find-duplicate-uuid x)))

;;; Malli schema for to ensure that all `:lib/uuid`s are unique.
(mr/def ::unique-uuids
  [:fn
   {:error/message "all :lib/uuids must be unique"
    :error/fn      (fn [{:keys [value]} _]
                     (str "Duplicate :lib/uuid " (pr-str (find-duplicate-uuid value))))}
   #'unique-uuids?])

(defn remove-namespaced-keys
  "Remove all the namespaced keys from a map."
  [m]
  (into {} (remove (fn [[k _v]] (qualified-keyword? k))) m))

(defn distinct-refs?
  "Is a sequence of `refs` distinct for the purposes of appearing in `:fields` or `:breakouts` (ignoring keys that
  aren't important such as namespaced keys and type info)?"
  [refs]
  (or
   (< (count refs) 2)
   (apply
    distinct?
    (for [ref refs]
      (lib.options/update-options ref (fn [options]
                                        (-> options
                                            remove-namespaced-keys
                                            (dissoc :base-type :effective-type))))))))
