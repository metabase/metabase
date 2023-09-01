(ns ^{:deprecated "0.48.0"} metabase.util.kebab-hating-map
  (:require
   [clojure.string :as str]
   [metabase.config :as config]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [potemkin :as p]
   [pretty.core :as pretty]
   [toucan2.core :as t2]
   [toucan2.instance :as t2.instance]))

(defn- kebab-cased-key? [k]
  (some-> k (str/includes? "-")))

(defn- warn-about-using-kebab-case [k]
  (let [e (ex-info (format "Accessing legacy metadata using :kebab-case key %s. This is not supported yet. Use %s instead."
                           (pr-str k)
                           (pr-str (u/->snake_case_en k)))
                   {:k k})]
    (if config/is-prod?
      (log/warn e)
      (throw e))))

(defn- normalize-key [k]
  (if (kebab-cased-key? k)
    (do
      (warn-about-using-kebab-case k)
      (u/->snake_case_en k))
    k))

(declare ->KebabHatingMap)

(p/def-map-type KebabHatingMap [m]
  (get [_this k default-value]
    (get m (normalize-key k) default-value))
  (assoc [this k v]
    (let [m' (assoc m (normalize-key k) v)]
      (if (identical? m m')
        this
        (->KebabHatingMap m'))))
  (dissoc [this k]
    (let [m' (dissoc m k)]
      (if (identical? m m')
        this
        (->KebabHatingMap m'))))
  (keys [_this]
    (keys m))
  (meta [_this]
    (meta m))
  (with-meta [this metta]
    (let [m' (with-meta m metta)]
      (if (identical? m m')
        this
        (->KebabHatingMap m'))))

  pretty/PrettyPrintable
  (pretty [_this]
    (list `kebab-hating-map m)))

(defn kebab-hating-map
  "Create a new map that handles either `snake_case` or `kebab-case` keys, but warns is you use `kebab-case` keys (in
  prod) or throws an Exception (in dev and tests). This is here mostly so we can throw errors if you
  have [[metabase.driver.metadata/->legacy-metadata]] but you're trying to treat it as MLv2 metadata."
  {:deprecated "0.48.0"}
  ([]
   (kebab-hating-map {}))
  ([m]
   (-> (if (t2/instance? m)
         (t2.instance/update-current m ->KebabHatingMap)
         (->KebabHatingMap (or m {})))
       (vary-meta assoc :metabase.driver/metadata-type :metabase.driver/metadata-type.legacy)))
  ([k v & more]
   (kebab-hating-map (into {} (cons [k v] (partition-all 2 more))))))

(defn kebab-hating-map?
  "Is this a [[kebab-hating-map]]?"
  {:deprecated "0.48.0"}
  [m]
  (instance? KebabHatingMap m))
