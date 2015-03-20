(ns metabase.models.hydrate
  "Functions for deserializing and hydrating fields in objects fetched from the DB."
  (:require [clojure.data.json :as json]
            [clojure.walk :as walk]
            [metabase.db :refer [sel]]
            [metabase.util :as u]))



(declare batched-hydrate
         can-batched-hydrate?
         counts-apply
         hydrate
         hydrate-1
         hydrate-kw
         hydrate-many
         hydrate-vector
         hydration-key->entity
         k->k_id
         simple-hydrate
         valid-hydration-form?)

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


;; ## HYDRATE 2.0

(defn hydrate
  "Hydrate a single object or sequence of objects.

  **Batched Hydration**

  Hydration attempts to do a *batched hydration* where possible.
  If the key being hydrated is defined as one of some entity's `:hydration-keys`,
  `hydrate` will do a batched `sel` if a corresponding key ending with `_id`
  is found in the objects being hydrated.

  `defentity` threads resulting map through its forms using `->`, so define
  `:hydration-keys` with `:assoc`:

    (defentity User
      (assoc :hydration-keys #{:user}))

    (hydrate [{:user_id 100}, {:user_id 101}] :user)

  Since `:user` is a hydration key for `User`, a single `sel` will used to
  fetch `Users`:

    (sel :many User :id [in #{100 101}])

  The corresponding `Users` are then added under the key `:user`.

  **Simple Hydration**

  If the key is *not* eligible for batched hydration, `hydrate` will look for delays
  in objects being hydrated whose keys match the hydration key. These will be
  evaluated and their values will replace the delays.

    (hydrate [{:fish (delay 1)} {:fish (delay 2)}] :fish)
      -> [{:fish 1} {:fish 2}]

  **Hydrating Multiple Keys**

  You can hydrate several keys at one time:

    (hydrate {:a (delay 1) :b (delay 2)} :a :b)
      -> {:a 1 :b 2}

  **Nested Hydration**

  You can do recursive hydration by listing keys inside a vector:

    (hydrate {:a (delay {:b (delay 1)})} [:a :b])
      -> {:a {:b 1}}

  The first key in a vector will be hydrated normally, and any subsequent keys
  will be hydrated *inside* the corresponding values for that key.

    (hydrate {:a (delay {:b (delay {:c (delay 1)})
                         :e (delay 2)})}
             [:a [:b :c] :e])
      -> {:a {:b {:c 1} :e 2}}

    (hydrate {:a (delay {:b (delay {:c (delay 1)})})
              :e (delay 2)} [:a [:b :c] :e])"
  [results k & ks]
  {:pre [(valid-hydration-form? k)
         (every? valid-hydration-form? ks)]}
  (when results
    (if (sequential? results) (if (empty? results) results
                                  (apply hydrate-many results k ks))
        (first (apply hydrate-many [results] k ks)))))

;; ## HYDRATE IMPLEMENTATION

;;                          hydrate <-------------+
;;                            |                   |
;;                        hydrate-many            |
;;                            | (for each form)   |
;;                        hydrate-1               | (recursively)
;;                            |                   |
;;                 keyword? --+-- vector?         |
;;                    |             |             |
;;               hydrate-kw    hydrate-vector ----+
;;                    |
;;           can-batched-hydrate?
;;                    |
;;         false -----+----- true
;;          |                 |
;;     simple-hydrate    batched-hydrate

;; ### Primary Hydration Fns

(defn- hydrate-many
  "Hydrate many hydration forms across a *sequence* of RESULTS by recursively calling `hydrate-1`."
  [results k & more]
  (let [results (hydrate-1 results k)]
    (if-not (seq more) results
            (recur results (first more) (rest more)))))

(defn- hydrate-1
  "Hydrate a single hydration form."
  [results k]
  (if (keyword? k) (hydrate-kw results k)
      (hydrate-vector results k)))

(defn- hydrate-vector
  "Hydrate a nested hydration form (vector) by recursively calling `hydrate`."
  [results [k & more]]
  (let [results (hydrate results k)]
    (if-not (seq more) results
            (counts-apply results k #(apply hydrate % more)))))

(defn- hydrate-kw
  "Hydrate a single keyword."
  [results k]
  (if (can-batched-hydrate? results k) (batched-hydrate results k)
      (simple-hydrate results k)))

(defn- simple-hydrate
  "Hydrate keyword K in results by dereferencing corresponding delays when applicable."
  [results k]
  {:pre [(keyword? k)]}
  (map (fn [result]
         (let [v (k result)]
           (if-not (delay? v) result      ; if v isn't a delay it's either already hydrated or nil.
                   (assoc result k @v)))) ; don't barf on nil; just no-op
       results))

(defn- batched-hydrate
  "Hydrate keyword DEST-KEY across all RESULTS by aggregating corresponding source keys (`DEST-KEY_id`),
   doing a single `sel`, and mapping corresponding objects to DEST-KEY."
  ([results dest-key]
   {:pre [(keyword? dest-key)]}
   (let [entity     (@hydration-key->entity dest-key)
         source-key (k->k_id dest-key)
         ids        (set (map source-key results))
         objs       (->> (sel :many entity :id [in ids])
                         (map (fn [obj]
                                {(:id obj) obj}))
                         (into {}))]
     (map (fn [result]
            (let [source-id (result source-key)
                  obj       (objs source-id)]
              (assoc result dest-key obj)))
          results))))

;; #### Possible Improvements
;; TODO - It would be *nice* to extend this to work with one-to-many relationships. e.g. `Dashboard -> Cards`
;;
;; It could work like this:
;;
;;     (defentity Card
;;       (assoc :hydration-keys {:1t1 {:keys #{:card}}        ; (hydrate obj :card)    -> obj.card_id <-> Card.id
;;                               :1tM {:keys #{:cards}
;;                                     :fks #{:table_id}}}))  ; (hydrate table :cards) -> obj.id <-> Card.table_id
;;
;;     (-> (sel :many Table ...)
;;         (hydrate :cards))
;;
;; 1.  `:hydration-keys` can be reworked to differentiate between one-to-one hydrations and one-to-many hydrations
;;     (not sure on the exact format yet)
;;
;; 2.  one-to-many hydrations will additionally need to know what fields it has that can be used as Foreign Keys
;;     -  Could we reflect on the DB and add this info at runtime?
;;     -  Could we just use `belongs-to` / `has-one` / etc? (or an augmented version thereof) to specify foreign keys?
;;
;; 3.  We can infer that `:table_id` is an FK to `Table` because `Table` has `:table` defined as a hydration key.
;;     `:table <-> :table_id`
;;
;; 4.  (This is the tricky part)
;;     If we could somehow know that we are trying to hydrate `Tables`, we would know we could use `:id -> :table_id`
;;     and could do a `(sel Card :table_id [in ids])`
;;     -  We could add a key like `:_type :Table` (?) to results so we know the type


;; ### Helper Fns

(def ^:private hydration-key->entity
  "Delay that returns map of `hydration-key` -> korma entity.
   e.g. `:user -> User`.

   This is built pulling the `:hydration-keys` set from all korma entities."
  (delay (->> (all-ns)
              (mapcat ns-publics)
              vals
              (map var-get)
              (filter (u/fn-> type (= :korma.core/Entity)))
              (filter :hydration-keys)
              (mapcat (fn [{:keys [hydration-keys] :as entity}]
                        (assert (and (set? hydration-keys) (every? keyword? hydration-keys))
                                (str ":hydration-keys should be a set of keywords. In: " entity))
                        (map (u/rpartial vector entity)
                             hydration-keys)))
              (into {}))))

(def ^:private batched-hydration-keys
  "Delay that returns set of keys that are elligible for batched hydration."
  (delay (set (keys @hydration-key->entity))))


(defn- k->k_id
  "Append `_id` to a keyword. `(k->k_id :user) -> :user_id`"
  [k]
  (keyword (str (name k) "_id")))

(defn- can-batched-hydrate?
  "Can we do a batched hydration of RESULTS with key K?"
  [results k]
  (and (contains? @batched-hydration-keys k)
       (every? (u/rpartial contains? (k->k_id k)) results)))

(defn- valid-hydration-form?
  "Is this a valid argument to `hydrate`?"
  [k]
  (or (keyword? k)
      (and (sequential? k)
           (keyword? (first k))
           (every? valid-hydration-form? (rest k)))))


;; ### Counts Destructuring

;; This was written at 4 AM. It works (somehow) and is well-tested.
;; But I feel like it's a bit overengineered and there's probably a clearer way of doing this.
;;
;; At a high level, these functions let you aggressively flatten a sequence of maps by a key
;; so you can apply some function across it, and then unflatten that sequence.
;;
;; 1.  Get a value that can be used to unflatten a sequence later with `counts-of`.
;; 2.  Flatten the sequence with `counts-flatten`
;; 3.  Modify the flattened sequence as needed
;; 4.  Unflatten the sequence by calling `counts-unflatten` with the modified sequence and value from step 1
;; 5.  `map merge` the original sequence and the unflattened sequence.
;;
;; For your convenience `counts-apply` combines these steps for you.

(defn- counts-of
  "Return a sequence of counts / keywords that can be used to unflatten
   COLL later.

    (counts-of [{:a [{:b 1} {:b 2}], :c 2}
                {:a {:b 3}, :c 4}] :a)
      -> [2 :atom]

   For each `x` in COLL, return:

   *  `(count (k x))` if `(k x)` is sequential
   *  `:atom`         if `(k x)` is otherwise non-nil
   *  `:nil`          if `x` has key `k` but the value is nil
   *  `nil`           if `x` is nil."
  [coll k]
  (map (fn [x]
         (cond
           (sequential? (k x)) (count (k x))
           (k x)               :atom
           (contains? x k)     :nil
           :else               nil))
       coll))

(defn- counts-flatten
  "Flatten COLL by K.

    (counts-flatten [{:a [{:b 1} {:b 2}], :c 2}
                     {:a {:b 3}, :c 4}] :a)
      -> [{:b 1} {:b 2} {:b 3}]"
  [coll k]
  {:pre [(sequential? coll)
         (keyword? k)]}
  (->> coll
       (map k)
       (mapcat (fn [x]
                 (if (sequential? x)  x
                     [x])))))

(defn- counts-unflatten
  "Unflatten COLL by K using COUNTS from `counts-of`.

    (counts-unflatten [{:b 2} {:b 4} {:b 6}] :a [2 :atom])
      -> [{:a [{:b 2} {:b 4}]}
          {:a {:b 6}}]"
  ([coll k counts]
   (counts-unflatten [] coll k counts))
  ([acc coll k [count & more]]
   (let [[unflattend coll] (condp = count
                             nil   [nil (rest coll)]
                             :atom [(first coll) (rest coll)]
                             :nil  [:nil (rest coll)]
                             (split-at count coll))
         acc (conj acc unflattend)]
     (if-not (seq more) (map (fn [x]
                               (when x
                                 {k (when-not (= x :nil) x)}))
                             acc)
             (recur acc coll k more)))))

(defn- counts-apply
  "Apply F to values of COLL flattened by K, then return unflattened/updated results.

    (counts-apply [{:a [{:b 1} {:b 2}], :c 2}
                   {:a {:b 3}, :c 4}]
      :a #(update-in % [:b] (partial * 2)))

      -> [{:a [{:b 2} {:b 4}], :c 2}
          {:a {:b 3}, :c 4}]"
  [coll k f]
  (let [counts (counts-of coll k)
        new-vals (-> coll
                     (counts-flatten k)
                     f
                     (counts-unflatten k counts))]
    (map merge coll new-vals)))
