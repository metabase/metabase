(ns src.dev.add-load
  (:require [clojure.walk :as walk]
            [dev.with-perm :as perm]
            [metabase.util.malli :as mu]))

(defn- extract-bindings [bindings inserted]
  (update-vals bindings #(get inserted %)))

(defn- fill-attrs [ids attrs]
  (walk/postwalk
   (fn [x] (if-let [value (get ids x)] value x))
   attrs))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; PUBLIC API ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(mu/defn from-script
  "Takes a script and inserts the entities into the database. Returns a map of the ids of the entities inserted.

  The script is similar to the one used by [[mt/with-temp]], but instead of code to be executed, it contains the
  entities to be inserted, and values to be bound _as data_. The entities are inserted in the order they appear in the
  script, and their bound values are saved in a map.

  Example:

  - Bind the coll-id, kind of like with-temp:
  ```clojure
  (from-script [[:model/Collection {:?/coll-id :id} {}]])
  ;;=> {:coll-id 407}
  ```

  - Insert a card and have it reference the collection:
  ```clojure
  (from-script
    [[:model/Collection {:?/coll-id :id} {}]
     [:model/Collection {:?/coll-id-two :id} {}]
     [:model/Card {:?/card-id :id
                   :?/entity_id :entity-id}]])
  ;;=> {:coll-id 408, :coll-id-two 409, :card-id 9550, :entity-id \"BZiPJnAlnm69pUvP7rCXY\"}
  ```

  Because the script itself is just data, we can use it as an api for inserting generated load-testing data.

  - Example with n cards that keep track of their card and entity ids.

  ```clojure
  (defn two-collections-and-n-cards [n]
    (reduce into
            [[:model/Collection {:?/coll-id :id} {}]
             [:model/Collection {:?/coll-id-two :id} {}]]
            (vec (for [i (range 1 (inc n))]
                   [[:model/Card
                     {(keyword \"?\" (str \"card-id-\" i)) :id
                      (keyword \"?\" (str \"entity-id-\" i)) :entity_id}
                     {:collection_id :?/coll-id}]]))))

  (from-script (two-collections-and-n-cards 5))
  ;;=>
  {:coll-id 452
   :coll-id-two 453

   :card-id-1 36667
   :entity-id-1 \"f7H5BjF5F2Y-doCek40-1\"
   :card-id-2 36668
   :entity-id-2 \"-1y3Rc3HmBomcVfzt7wyk\"
   :card-id-3 36669
   :entity-id-3 \"Xqj0Q3O0mNtCkIEq4Mr6b\"
   :card-id-4 36670
   :entity-id-4 \"Pd9ZsZNI0YbnEj8M4TOFp\"}
  ```"
  [script :- [:sequential [:tuple :keyword :map :map]]]
  (let [ids (atom {})]
    (doseq [[modelable bindings attrs] script]
      (let [inserted (perm/with-perm modelable (fill-attrs @ids attrs))]
        (swap! ids merge (extract-bindings bindings inserted))
        inserted))
    (update-keys @ids (comp keyword name))))
