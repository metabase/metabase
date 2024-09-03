(ns metabase.lib.schema.util
  (:refer-clojure :exclude [ref])
  (:require
   [clojure.walk :as walk]
   [metabase.lib.options :as lib.options]
   [metabase.util :as u]
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

(defn remove-lib-uuids
  "Recursively remove all uuids from x."
  [x]
  (walk/postwalk
   (fn [x]
     (if (map? x)
       (dissoc x :lib/uuid)
       x))
   x))

(mr/def ::distinct-ignoring-uuids
  [:fn
   {:error/message "values must be distinct ignoring uuids"
    :error/fn      (fn [{:keys [value]} _]
                     (str "Duplicate values ignoring uuids in: " (pr-str (remove-lib-uuids value))))}
   (comp u/empty-or-distinct? remove-lib-uuids)])

(defn distinct-ignoring-uuids
  "Add an additional constraint to `schema` that requires all elements to be distinct after removing uuids."
  [schema]
  [:and
   schema
   [:ref ::distinct-ignoring-uuids]])
