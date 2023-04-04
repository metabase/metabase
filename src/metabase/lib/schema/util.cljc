(ns metabase.lib.schema.util
  (:require
   [metabase.lib.options :as lib.options]))

(declare collect-uuids)

(defn- collect-uuids-in-map [m]
  (into (if-let [our-uuid (or (:lib/uuid (lib.options/options m))
                              (:lib/uuid m))]
          [our-uuid]
          [])
        (comp (remove (fn [[k _v]]
                        (#{:lib/metadata :lib/stage-metadata :lib/options} k)))
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

(def UniqueUUIDs
  "Malli schema for to ensure that all `:lib/uuid`s are unique."
  [:fn
   {:error/message "all :lib/uuids must be unique"
    :error/fn      (fn [{:keys [value]} _]
                     (str "Duplicate :lib/uuid " (pr-str (find-duplicate-uuid value))))}
   #'unique-uuids?])
