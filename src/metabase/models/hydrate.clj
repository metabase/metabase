(ns metabase.models.hydrate
  (:require [clojure.data.json :as json]
            [clojure.walk :as walk]
            [metabase.db :refer [sel]]
            [metabase.util :as util]))

(declare hydrate
         hydrate-one
         hydrate-many
         hydrate-one-key)

(defn hydrate
  "Hydrate a single object or sequence of objects.

  Hydration simply evaluates functions associated with the keys you specify, e.g.

     (hydrate {:a (fn [] 100)} :a) -> {:a 100}

   You can also specify nested keys to do recursive hydration:

     (hydrate {:a (fn [] {:b (fn [] 20)})}
               [:a :b]) -> {:a {:b 20}}"
  [object & ks]
  (apply (if (map? object) hydrate-one
             hydrate-many)
         object ks))

(defn- hydrate-one
  "Hydrate a single object."
  [object & [first-key & rest-keys]]
  (let [object (hydrate-one-key object first-key)]
    (if-not rest-keys object
            (apply hydrate object rest-keys))))

(defn- hydrate-many
  "Hydrate a sequence of several objects."
  [objects & ks]
  (map #(apply hydrate % ks) objects))

(defn- hydrate-one-key
  "Hydrate a single key for an object."
  [object k]
  (let [[k & sub-keys] (if (vector? k) k [k])
        hydration-fn (k object)]
    (if-not hydration-fn object
            (let [hydrated-val (if (fn? hydration-fn) (hydration-fn)
                                   (if (delay? hydration-fn) @hydration-fn
                                       (throw (Exception. (str "Error: hydration-fn for '" k "' is not a function or delay")))))
                  hydrated-val (if sub-keys (apply hydrate hydrated-val sub-keys)
                                   hydrated-val)]
              (assoc object k hydrated-val)))))

(defn- read-json-str-or-clob
  "If STR is a JDBC Clob, convert to a String. Then call `json/read-str`."
  [str]
  (when-let [str (if-not (= (type str) org.h2.jdbc.JdbcClob) str
                         (util/jdbc-clob->str str))]
    (json/read-str str)))

(defn realize-json
  "Deserialize JSON strings keyed by JSON-KEYS.
   RESULT may either be a single result or a sequence of results. "
  [result & [first-key & rest-keys]]
  (if (sequential? result) (map #(apply realize-json % first-key rest-keys) result) ;  map ourself recursively if RESULT is a sequence
      (let [result (or (some->> result                                              ; deserialize the first JSON key
                                first-key
                                read-json-str-or-clob
                                walk/keywordize-keys
                                (assoc result first-key))
                       result)]
        (if (empty? rest-keys) result                                               ; if there are remaining keys recurse to realize those
            (recur result rest-keys)))))

(defn simple-batched-hydrate
  "Similiar in functionality to `hydrate`, but instead aggregates the values of SOURCE-KEY for all RESULTS,
   does a single select, and maps the corresponding objects to DEST-KEY.

   It is assumed that SOURCE-KEY is a foregin key to a field named `:id` in ENTITY."
  [results entity source-key dest-key]
  (let [ids (->> (map source-key results)
                 set)
        objs (->> (eval `(sel :many ~entity :id ~(vector 'in ids)))
                  (map (fn [obj]
                         {(:id obj) obj}))
                  (reduce merge {}))]
    (->> results
         (map (fn [result]
                (let [source-id (result source-key)
                      obj (objs source-id)]
                  (assoc result dest-key obj)))))))
