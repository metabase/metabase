(ns src.dev.add-load
  (:require [clojure.walk :as walk]
            [dev.with-perm :as perm]
            [metabase.util.malli :as mu]))

(def ^:private logical-kw
  "A keyword that starts with a question mark, used to track values created by from-script."
  [:and :keyword [:fn #(= "?" (namespace %))]])

(mu/defn- extract-bindings
  "Extracts the bindings from the script and inserts the values into the ids map. This is the data oriented equivalent
  of let."
  [bindings :- [:or :map logical-kw] inserted]
  (cond (map? bindings)
        (update-vals bindings #(get inserted %))
        (and (keyword? bindings) (= "?" (namespace bindings)))
        {bindings inserted}))

(mu/defn- fill-attrs
  "Data oriented value resolution used to add attributes to a model from the [[attrs]] map."
  [ids :- :map attrs :- :map]
  (walk/postwalk
   (fn [x] (if-let [value (get ids x)] value x))
   attrs))

(def ^:private BindingForm [:or [:= :?] logical-kw :map])

(def ^:private NormalizedTuple [:tuple :keyword BindingForm :map])

(def ^:private Tuple [:or
            [:tuple :keyword]
            [:tuple :keyword BindingForm]
            NormalizedTuple])

(mu/defn- normalize-tuple :- NormalizedTuple
  [next-kw-thunk :- fn? t :- Tuple]
  (let [[model bindings attrs] t]
    [model
     (if (or (nil? bindings) (= :? bindings)) (next-kw-thunk) bindings)
     (or attrs {})]))

(mu/defn- from-script*
  "Takes a script and inserts the entities into the database. Returns a map of the ids of the entities inserted.

  The script is similar to the one used by [[mt/with-temp]], but instead of code to be executed, it contains the
  entities to be inserted, and values to be bound _as data_. The entities are inserted in the order they appear in the
  script, and their bound values are saved in a map."
  [script :- [:sequential Tuple]]
  (let [ids (atom {})]
    (doseq [[modelable bindings attrs] script]
      (let [inserted (perm/with-perm modelable (fill-attrs @ids attrs))]
        (swap! ids merge (extract-bindings bindings inserted))
        inserted))
    (update-keys @ids (comp keyword name))))

(defn- make-next-kw-thunk []
  (let [kw-idx (atom 0)]
    (fn [] (keyword "?" (str "_" (swap! kw-idx inc))))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; PUBLIC API ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;


(mu/defn from-script :- :map
  "Takes a script and inserts the entities into the database. Returns a map of the ids of the entities inserted."
  [script :- [:sequential Tuple]]
  (->>
   script
   (mapv (partial normalize-tuple (make-next-kw-thunk)))
   ;; TODO build a dag and insert in topological order, batched
   ;; ((fn [x] (def normalized-tuples x) x))
   from-script*))

(comment
  ;; ============================== Examples ==============================
  ;; One random card
  (from-script [[:model/Card]])

  ;; ignore the return value:
  (from-script [[:model/Card {}]])

  ;; Two random cards
  (from-script [[:model/Card] [:model/Card]])

  ;; One random card but give it a name
  (from-script [[:model/Card :? {:name "My Card 1"
                                 :description "This is a card"}]])

  ;; ignore the return value
  (from-script [[:model/Card {} {:name "My Card 5"}]])

  ;; One random card, given the key my-card
  (from-script [[:model/Card :?/my-card {:name "My Card 2"}]])

  ;; Desctructure card id
  (from-script [[:model/Card {:?/card-id :id} {:name "My Card 4"}]])

  ;; You can reuse ids from previous steps
  (from-script [[:model/Card {:?/card-id :id} {:name "My Card (w/ dashboard)"}]
                [:model/Dashboard {:?/dash-id :id} {:name "My Dashboard"}]
                [:model/DashboardCard :? {:card_id :?/card-id :dashboard_id :?/dash-id}]
                [:model/Card {:?/card-id :id} {:name "My Card (w/ dashboard)"}]
                [:model/Dashboard {:?/dash-id :id} {:name "My Dashboard"}]
                [:model/DashboardCard :? {:card_id :?/card-id :dashboard_id :?/dash-id}]
                [:model/Card {:?/card-id :id} {:name "My Card (w/ dashboard)"}]
                [:model/Dashboard {:?/dash-id :id} {:name "My Dashboard"}]
                [:model/DashboardCard :? {:card_id :?/card-id :dashboard_id :?/dash-id}]])
  )
