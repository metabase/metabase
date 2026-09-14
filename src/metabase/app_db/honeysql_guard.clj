(ns metabase.app-db.honeysql-guard
  (:require
   [metabase.util.honey-sql-2 :as h2x]
   [methodical.core :as methodical]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.tools.identity-query :as t2.identity-query])
  (:import
   (toucan2.tools.identity_query IdentityQuery)))

(set! *warn-on-reflection* true)

(comment t2.identity-query/keep-me)

(defn- allow-subquery?
  [x]
  (boolean (some-> x meta :allow-subquery)))

(defn- raw-honeysql-map?
  [x]
  (and (map? x)
       (contains? x :raw)))

(defn- inline-honeysql-map?
  [x]
  (and (map? x)
       (contains? x :inline)))

(defn- raw-honeysql-form?
  [x]
  (and (sequential? x)
       (= :raw (first x))))

(defn- inline-honeysql-form?
  [x]
  (and (sequential? x)
       (= :inline (first x))))

(defn- allow-raw-sql?
  [x]
  (boolean (some-> x meta :allow-raw-sql)))

(defn- safe-inline-value?
  [x]
  (cond
    (coll? x) (every? safe-inline-value? x)
    :else     (or (nil? x) (boolean? x) (number? x))))

(defn- safe-value?
  [v]
  (cond
    (or (raw-honeysql-map? v) (inline-honeysql-map? v))
    false

    (raw-honeysql-form? v)
    (allow-raw-sql? v)

    (inline-honeysql-form? v)
    (and (= 2 (count v))
         (or (safe-inline-value? (second v))
             (allow-raw-sql? v)))

    (h2x/typed? v)
    (safe-value? (second v))

    (map? v)
    (and (allow-subquery? v) (every? safe-value? (vals v)))

    (coll? v)
    (every? safe-value? v)

    :else             true))

(defn- safe-row?
  [row]
  (cond
    (map? row)  (every? safe-value? (vals row))
    (coll? row) (every? safe-value? row)
    :else       (safe-value? row)))

(defn safe-syntax?
  "Whether the compiled `query` map contains only allowed HoneySQL forms."
  [query]
  (if (map? query)
    (and (not (or (raw-honeysql-map? query) (inline-honeysql-map? query)))
         (every? safe-value? (vals (dissoc query :values :set)))
         (every? safe-row? (:values query))
         (safe-row? (:set query)))
    (safe-value? query)))

(methodical/defmethod t2.pipeline/build :around [:toucan.query-type/select.exists :default clojure.lang.IPersistentMap]
  [query-type model parsed-args resolved-query]
  (update-in (next-method query-type model parsed-args resolved-query)
             [:select 0 0 1] vary-meta assoc :allow-subquery true))

(methodical/defmethod t2.pipeline/compile :before :default
  [_query-type model built-query]
  (when-not (or (instance? IdentityQuery built-query)
                (safe-syntax? built-query))
    (throw (ex-info (str "A forbidden HoneySQL clause reached the app-DB compile step. Mark a deliberate subquery "
                         "with ^:allow-subquery, a deliberate [:raw ...] splice with ^:allow-raw-sql, and use "
                         "[:inline ...] only with a scalar literal.")
                    {:type ::unmarked-nested-map, :model model, :query built-query})))
  built-query)
