(ns metabase.lib.schema.util
  (:require
   [metabase.lib.options :as lib.options]))

(declare collect-uuids)

(defn- collect-uuids-in-map [m]
  (into (filterv some? [(:lib/uuid m)
                        (:lib/uuid (lib.options/options m))])
        (comp (remove (fn [[k _v]]
                        (#{:lib/metadata :lib/stage-metadata} k)))
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

(defn unique-uuids?
  "True if all the `:lib/uuid`s in something are unique."
  [x]
  (reduce
   (fn [seen x]
     (if (contains? seen x)
       (reduced false)
       (conj seen x)))
   #{}
   (collect-uuids x)))

(def UniqueUUIDs
  "Malli schema for to ensure that all `:lib/uuid`s are unique."
  [:fn
   {:error/message "all :lib/uuids must be unique"}
   #'unique-uuids?])
