(ns metabase.lib.core
  (:refer-clojure :exclude [remove replace =])
  (:require
   [metabase.lib.field :as lib.field]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.query :as lib.query]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.util :as u]))

(defn ^:export field
  ([x]
   (lib.field/field x))
  ([table x]
   (lib.field/field table x)))

(defn ^:export =
  [& args]
  (apply lib.filter/= args))

(defn ^:export join
  [& args]
  (apply lib.join/join args))

(defn ^:export joins
  [query]
  (lib.join/joins query))

(defn ^:export metadata
  [x]
  (lib.query/metadata x))

(defn ^:export native-query
  [& args]
  (apply lib.query/native-query args))

(defn ^:export query
  [& args]
  (apply lib.query/query args))

(defn ^:export order-by [& args]
  (apply lib.order-by/order-by args))

(defn ^:export order-bys [& args]
  (apply lib.order-by/order-bys args))

(defn ^:export field-metadata [& args]
  (apply lib.metadata/field-metadata args))

(defn ^:export saved-question-query
  [query]
  (let [query (update (js->clj query :keywordize-keys true) :dataset_query mbql.normalize/normalize)]
    (println "(pr-str query):" (pr-str query)) ; NOCOMMIT
    (lib.query/saved-question-query query)))

(defn ^:export to-js [x]
  (clj->js x :keyword-fn u/qualified-name))
