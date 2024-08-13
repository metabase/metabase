(ns metabase.lib.schema.util
  (:refer-clojure :exclude [ref])
  (:require
   [metabase.lib.options :as lib.options]
   [metabase.util.malli.registry :as mr]))

(declare collect-uuids*)

(defn- collect-uuids-in-map [m result]
  (when-let [our-uuid (or (:lib/uuid (lib.options/options m))
                          (:lib/uuid m))]
    ;; Keep duplicates in metadata of the result.
    (if (@result our-uuid)
      (vswap! result vary-meta update :duplicates (fnil conj #{}) our-uuid)
      (vswap! result conj our-uuid)))

  (reduce-kv (fn [_ k v]
               (when (not (qualified-keyword? k))
                 (collect-uuids* v result)))
             nil m))

(defn- collect-uuids-in-sequence [xs result]
  (run! #(collect-uuids* % result) xs))

(defn- collect-uuids* [x result]
  (cond
    (map? x)        (collect-uuids-in-map x result)
    (sequential? x) (collect-uuids-in-sequence x result)
    :else           nil))

(defn collect-uuids
  "Return all the `:lib/uuid`s in a part of an MBQL query (a clause or map) as a sequence. This will be used to ensure
  there are no duplicates."
  [x]
  (let [result (volatile! #{})]
    (collect-uuids* x result)
    @result))

(defn- find-duplicate-uuid [x]
  (:duplicates (meta (collect-uuids x))))

(defn unique-uuids?
  "True if all the `:lib/uuid`s in something are unique."
  [x]
  (empty? (find-duplicate-uuid x)))

;;; Malli schema for to ensure that all `:lib/uuid`s are unique.
(mr/def ::unique-uuids
  [:fn
   {:error/message "all :lib/uuids must be unique"
    :error/fn      (fn [{:keys [value]} _]
                     (str "Duplicate :lib/uuid " (pr-str (find-duplicate-uuid value))))}
   #'unique-uuids?])

(defn distinct-refs?
  "Is a sequence of `refs` distinct for the purposes of appearing in `:fields` or `:breakouts` (ignoring keys that
  aren't important such as namespaced keys and type info)?"
  [refs]
  (or
   (< (count refs) 2)
   (apply
    distinct?
    (for [ref refs]
      (let [options (lib.options/options ref)]
        (lib.options/with-options ref
          ;; Using reduce-kv to remove namespaced keys and some other keys to perform the comparison.
          (reduce-kv (fn [acc k _]
                       (if (or (qualified-keyword? k)
                               (= k :base-type)
                               (= k :effective-type))
                         (dissoc acc k)
                         acc))
                     options options)))))))
