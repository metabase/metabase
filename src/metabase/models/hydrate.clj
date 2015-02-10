(ns metabase.models.hydrate
  (:require [clojure.data.json :as json]
            [clojure.walk :as walk]))

(declare hydrate
         hydrate-one
         hydrate-many
         hydrate-one-key)

(defn hydrate
  "Hydrate a single object or sequence of objects.

  Hydration simply evaluates functions associated with the keys you specify, e.g.

   `(hydrate {:a (fn [] 100)} :a) -> {:a 100}`

   You can also specify nested keys to do recursive hydration:

   `(hydrate {:a (fn [] {:b (fn [] 20)})}
             [:a :b]) -> {:a {:b 20}}`"
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
        hydrated-val ((k object))
        hydrated-val (if sub-keys (apply hydrate hydrated-val sub-keys)
                         hydrated-val)]
    (assoc object k hydrated-val)))

(defn realize-json
  "Deserialize JSON strings keyed by JSON-KEYS.
   RESULT may either be a single result or a sequence of results. "
  [result & [first-key & rest-keys]]
  (if (sequential? result) (map #(apply realize-json % first-key rest-keys) result) ;  map ourself recursively if RESULT is a sequence
      (let [result (or (some->> result                                              ; deserialize the first JSON key
                                first-key
                                json/read-str
                                walk/keywordize-keys
                                (assoc result first-key))
                       result)]
        (if (empty? rest-keys) result                                               ; if there are remaining keys recurse to realize those
            (recur result rest-keys)))))
