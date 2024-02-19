(ns metabase.util.redact
  (:require
   [medley.core :as m]))

(set! *warn-on-reflection* true)

(defmulti redact*
  "Replace sensitive info before exposing data, e.g. via the API. The precise format may depend on the current user."
  (fn [sensitivity-info _data] (:type sensitivity-info)))

(defn- info [x]
  (:metabase/sensitive (meta x)))

(defn- strip-info [x]
  (if (meta x)
    (vary-meta x dissoc :metabase/sensitive)
    x))

(defn mark-sensitive
  "Tag the given value with metadata indicating that it is sensitive."
  [x type-key & {:as options}]
  (vary-meta x assoc :metabase/sensitive (assoc options :type type-key)))

(defn sensitive?
  "Is the given datum sensitive?"
  [x]
  (boolean (info x)))

(defn- lazy-pre-walk*
  "Similar to [[clojure.core/walk]], but only support pre-walks, and aims to be fully lazy.
   It gives up on preserving types, but it preserve toucan instances as their original model."
  [f form]
  (cond
    (map? form) (m/map-vals f form)
    (seq? form) (map f form)
    (coll? form) (map f form)
    :else form))

(defn- lazy-pre-walk
  "Similar to [[clojure.core/prewalk]], but avoids consuming seqs with doall."
  [f form]
  (lazy-pre-walk* (partial lazy-pre-walk f) (f form)))

(defn redact
  "Replace sensitive info before exposing data, e.g. via the API. The precise format may depend on the current user."
  [data]
  (lazy-pre-walk
   (fn [x]
     (if-let [i (info x)]
       (strip-info (redact* i x))
       x))
   data))
