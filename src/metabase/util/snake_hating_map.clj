(ns metabase.util.snake-hating-map
  "This is a map type that catches attempts to get `:snake_case` values from it. In prod, it logs a warning and gets the
  value for the equivalent `kebab-case` key; in tests and dev it throws an Exception.

  This is here so we can catch driver code that needs to be updated in 48+ to use MLv2 metadata rather than Toucan
  instances. After 51 we can remove this, everything should be updated by then."
  (:require
   [clojure.string :as str]
   [metabase.config :as config]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [potemkin :as p]
   [pretty.core :as pretty]))

(defn- snake-cased-key? [k]
  (some-> k (str/includes? "_")))

(defn- warn-about-using-snake-case [k]
  (let [e (ex-info (format "Accessing metadata using :snake_case key %s. This is deprecated in 0.48.0. Use %s instead."
                           (pr-str k)
                           (pr-str (u/->kebab-case-en k)))
                   {:k k})]
    (if config/is-prod?
      (log/warn e)
      (throw e))))

(defn- normalize-key [k]
  (if (snake-cased-key? k)
    (do
      (warn-about-using-snake-case k)
      (u/->kebab-case-en k))
    k))

(declare ->SnakeHatingMap)

(p/def-map-type SnakeHatingMap [m]
  (get [_this k default-value]
    (get m (normalize-key k) default-value))
  (assoc [this k v]
    (let [m' (assoc m (normalize-key k) v)]
      (if (identical? m m')
        this
        (->SnakeHatingMap m'))))
  (dissoc [this k]
    (let [m' (dissoc m k)]
      (if (identical? m m')
        this
        (->SnakeHatingMap m'))))
  (keys [_this]
    (keys m))
  (meta [_this]
    (meta m))
  (with-meta [this metta]
    (let [m' (with-meta m metta)]
      (if (identical? m m')
        this
        (->SnakeHatingMap m'))))

  pretty/PrettyPrintable
  (pretty [_this]
    (list `snake-hating-map m)))

(defn snake-hating-map
  "Create a new map that handles either `snake_case` or `kebab-case` keys, but warns is you use `snake_case`
  keys (in prod) or throws an Exception (in dev and tests). This is here so we can catch code that needs to be updated
  to use MLv2 metadata in 48+."
  ([]
   (snake-hating-map {}))
  ([m]
   (-> (or m {})
       (vary-meta assoc :metabase.driver/metadata-type :metabase.driver/metadata-type.mlv2)
       ->SnakeHatingMap))
  ([k v & more]
   (snake-hating-map (into {k v} (partition-all 2) more))))
