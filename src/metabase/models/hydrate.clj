(ns metabase.models.hydrate
  (:require [clojure.data.json :as json]
            [clojure.walk :as walk]
            [metabase.db :refer [sel]]
            [metabase.db.internal :refer [entity->korma]]
            [metabase.util :as u]))

(declare hydrate
         hydrate-1)

;; ## REALIZE-JSON

(defn- read-json-str-or-clob
  "If STR is a JDBC Clob, convert to a String. Then call `json/read-str`."
  [str]
  (when-let [str (if-not (= (type str) org.h2.jdbc.JdbcClob) str
                         (u/jdbc-clob->str str))]
    (json/read-str str)))

(defn realize-json
  "Deserialize JSON strings keyed by JSON-KEYS.
   RESULT may either be a single result or a sequence of results. "
  [result & [first-key & rest-keys]]
  (if (sequential? result) (map #(apply realize-json % first-key rest-keys) result) ;  map ourself recursively if RESULT is a sequence
      (let [result (cond-> result
                     (first-key result) (->> first-key
                                             read-json-str-or-clob
                                             walk/keywordize-keys
                                             (assoc result first-key)))]
        (if (empty? rest-keys) result                                               ; if there are remaining keys recurse to realize those
            (recur result rest-keys)))))


;; ## SIMPLE-BATCHED-HYDRATE (DEPRECATED)

(defn- simple-batched-hydrate
  "Similiar in functionality to `hydrate`, but instead aggregates the values of SOURCE-KEY for all RESULTS,
   does a single select, and maps the corresponding objects to DEST-KEY.

   It is assumed that SOURCE-KEY is a foregin key to a field named `:id` in ENTITY."
  [results entity source-key dest-key]
  (let [ids (->> (map source-key results)
                 set)
        objs (->> (sel :many entity :id [in ids])
                  (map (fn [obj]
                         {(:id obj) obj}))
                  (into {}))]
    (->> results
         (map (fn [result]
                (let [source-id (result source-key)
                      obj (objs source-id)]
                  (assoc result dest-key obj)))))))


;; ## HYDRATE 2.0

;; TODO: this would be nicer if these were instead defined in the entity files
;; with multimethods for each key?
;; or for each entity (reflect to "discover" all the metabase entities and then call multimethods)
(def ^:private hydration-key->entity
  {:author       'metabase.models.user/User
   :card         'metabase.models.card/Card
   :creator      'metabase.models.user/User
   :database     'metabase.models.database/Database
   :db           'metabase.models.database/Database
   :destination  'metabase.models.field/Field
   :organization 'metabase.models.org/Org
   :origin       'metabase.models.field/Field
   :table        'metabase.models.table/Table
   :user         'metabase.models.user/User
   :query        'metabase.models.query/Query})

(def ^:private hydration-keys
  (set (keys hydration-key->entity)))


(def ^:private hydration-key->korma
  (memoize
   (fn [k]
     (->> k hydration-key->entity entity->korma))))

(defn- k->k_id [k]
  (keyword (str (name k) "_id")))

(defn- can-batched-hydrate? [results k]
  (and (contains? hydration-keys k)
       (every? (u/rpartial contains? (k->k_id k)) results)))

(defn- valid-hydration-form? [k]
  (or (keyword? k)
      (and (sequential? k)
           (keyword? (first k))
           (every? valid-hydration-form? (rest k)))))

(defn- simple-hydrate [results k]
  {:pre [(keyword? k)]}
  (map (fn [result]
         (let [v (k result)]
           (when (fn? v)
             (throw (Exception. (format "Warning: '%s' is a function. Hydration via functions is deprecated; please use a delay instead. In: %s" k result))))
           (if-not (delay? v) result      ; if v isn't a delay it's either already hydrated or nil.
                   (assoc result k @v)))) ; don't barf on nil; just no-op
       results))

(defn- batched-hydrate [results k]
  {:pre [(keyword? k)]}
  (simple-batched-hydrate results (hydration-key->korma k) (k->k_id k) k))

(defn- hydrate-kw [results k]
  (if (can-batched-hydrate? results k) (batched-hydrate results k)
      (simple-hydrate results k)))

(defn counts-of
  "Return a sequence of:
   -  `(count (k x))` for each item `x` in COLL where `(sequential? (k x))`;
   -  `:atom` for all values of `(k x)` that are non-nil;
   -  `:nil`  if `k` is present in `x` but is nil
   -  `nil`   if `x` is nil.

    (counts-of [{:f [:a :b]}, {:f {:c 1}}, {:f nil}] :f)
      -> [2 :atom nil]"
  [coll k]
  (map (fn [x]
         (cond
           (sequential? (k x)) (count (k x))
           (k x)               :atom
           (contains? x k)     :nil
           :else               nil))
       coll))

(defn counts-flatten [coll k]
  {:pre [(sequential? coll)
         (keyword? k)]}
  (->> coll
       (map k)
       (mapcat (fn [x]
                 (if (sequential? x)  x
                     [x])))))

(defn counts-unflatten-1 [coll count]
  (condp = count
    nil   [nil (rest coll)]
    :atom [(first coll) (rest coll)]
    :nil  [:nil (rest coll)]
    (split-at count coll)))

(defn counts-unflatten
  ([coll k counts]
   (counts-unflatten [] coll k counts))
  ([acc coll k [count & more]]
   (let [[unflattend coll] (counts-unflatten-1 coll count)
         acc (conj acc unflattend)]
     (if-not (seq more) (map (fn [x]
                               (when x
                                 {k (when-not (= x :nil) x)}))
                             acc)
             (recur acc coll k more)))))

(defn counts-apply [coll k f]
  (let [counts (counts-of coll k)
        new-vals (-> coll
                     (counts-flatten k)
                     f
                     (counts-unflatten k counts))]
    (map merge coll new-vals)))

(defn- hydrate-vector [results [k & more]]
  (let [results (hydrate results k)]
    (if-not (seq more) results
            (counts-apply results k #(apply hydrate % more)))))

(defn- hydrate-1 [results k]
  (if (keyword? k) (hydrate-kw results k)
      (hydrate-vector results k)))

(defn- hydrate-many
  [results k & more]
  (let [results (hydrate-1 results k)]
    (if-not (seq more) results
            (recur results (first more) (rest more)))))

(defn hydrate
  "Hydrate a single object or sequence of objects.

  Hydration looks for keys like `:user` and fetches values corresponding
  Hydration simply evaluates functions associated with the keys you specify, e.g.

     (hydrate {:a (fn [] 100)} :a) -> {:a 100}

   You can also specify nested keys to do recursive hydration:

     (hydrate {:a (fn [] {:b (fn [] 20)})}
               [:a :b]) -> {:a {:b 20}}"
  [results k & ks]
  {:pre [(valid-hydration-form? k)
         (every? valid-hydration-form? ks)]}
  (when results
    (if (sequential? results) (if (empty? results) results
                                  (apply hydrate-many results k ks))
        (first (apply hydrate-many [results] k ks)))))
