(ns metabase.util.malli.strip
  "Remove the keys a value's map schemas do not declare, leaving every value that loses nothing identical to the one
  passed in."
  (:require
   [malli.core :as mc]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(declare stripper)

(def ^:private open-map-types
  "Schema types that accept a map with any keys."
  #{:any :some :map-of 'any? 'some? 'map?})

(defn- top-level-keys
  "The keys `schema` declares for the map it describes: `::any` when it does not restrict them, nil when it describes
  no map."
  ([schema]
   (top-level-keys schema #{}))
  ([schema visited]
   (let [schema   (mc/schema schema)
         union-of (fn [children]
                    (reduce (fn [acc child]
                              (let [ks (top-level-keys child visited)]
                                (if (= ks ::any)
                                  (reduced ::any)
                                  (into (or acc #{}) ks))))
                            nil
                            children))]
     (case (mc/type schema)
       :map              (let [ks (into #{} (map first) (mc/children schema))]
                           (if (or (false? (:closed (mc/properties schema)))
                                   (empty? ks)
                                   (contains? ks ::mc/default))
                             ::any
                             ks))
       (:and :or)        (union-of (mc/children schema))
       (:orn :multi)     (union-of (map peek (mc/children schema)))
       (:maybe :schema)  (top-level-keys (first (mc/children schema)) visited)
       (cond
         (contains? open-map-types (mc/type schema))
         ::any

         (mc/-ref-schema? schema)
         (if (contains? visited (mc/form schema))
           ::any
           (top-level-keys (mc/deref schema) (conj visited (mc/form schema))))

         :else
         nil)))))

(defn- map-elements
  "Apply `f` to every element of the collection `coll`, returning `coll` itself when no element changes."
  [f coll]
  (let [changed? (volatile! false)
        elements (mapv (fn [x]
                         (let [x' (f x)]
                           (when-not (identical? x x')
                             (vreset! changed? true))
                           x'))
                       coll)]
    (cond
      (not @changed?) coll
      (vector? coll)  (with-meta elements (meta coll))
      (set? coll)     (with-meta (set elements) (meta coll))
      :else           (with-meta (apply list elements) (meta coll)))))

(defn- update-existing [m k f]
  (if-let [e (find m k)]
    (let [v  (val e)
          v' (f v)]
      (if (identical? v v')
        m
        (assoc m k v')))
    m))

(defn- map-stripper [schema extra-keys]
  (let [props    (mc/properties schema)
        entries  (mc/children schema)
        ks       (into #{} (map first) entries)
        strip?   (and (contains? #{nil true} (:closed props))
                      (seq ks)
                      (not (contains? ks ::mc/default))
                      (not= extra-keys ::any))
        kept     (when strip? (into ks extra-keys))
        children (into []
                       (keep (fn [[k _ child]]
                               (when-not (= k ::mc/default)
                                 (when-let [f (stripper child)]
                                   [k f]))))
                       entries)]
    (when (or strip? (seq children))
      (fn [m]
        (if (map? m)
          (let [m (if strip?
                    (reduce-kv (fn [acc k _] (if (contains? kept k) acc (dissoc acc k))) m m)
                    m)]
            (reduce (fn [acc [k f]] (update-existing acc k f)) m children))
          m)))))

(defn- branch-stripper
  "A stripper that strips a value by the first of `branches`, `[schema stripper]` pairs, whose schema it matches."
  [branches]
  (when (some peek branches)
    (let [branches (mapv (fn [[schema f]] [(mr/validator schema) f]) branches)]
      (fn [v]
        (if-let [f (some (fn [[valid? f]] (when (valid? v) (or f identity))) branches)]
          (f v)
          v)))))

(defn- stripper*
  [schema extra-keys]
  (let [schema (mc/schema schema)]
    (case (mc/type schema)
      :map
      (map-stripper schema extra-keys)

      :and
      (let [ks  (top-level-keys schema)
            fns (into [] (keep #(stripper % ks)) (mc/children schema))]
        (when (seq fns)
          (fn [v] (reduce (fn [v f] (f v)) v fns))))

      :or
      (branch-stripper (mapv (fn [child] [child (stripper child extra-keys)]) (mc/children schema)))

      :orn
      (branch-stripper (mapv (fn [[_ _ child]] [child (stripper child extra-keys)]) (mc/children schema)))

      :multi
      (let [dispatch (:dispatch (mc/properties schema))
            dispatch (if (keyword? dispatch) #(get % dispatch) dispatch)
            branches (into {} (map (fn [[k _ child]] [k (stripper child extra-keys)])) (mc/children schema))]
        (when (some val branches)
          (fn [v]
            (let [k (try (dispatch v) (catch Throwable _ ::no-dispatch))
                  f (get branches k (get branches ::mc/default))]
              (if f (f v) v)))))

      (:maybe :schema)
      (when-let [f (stripper (first (mc/children schema)) extra-keys)]
        (fn [v] (if (nil? v) v (f v))))

      (:vector :sequential :set :* :+ :?)
      (when-let [f (stripper (first (mc/children schema)))]
        (fn [v] (if (coll? v) (map-elements f v) v)))

      :tuple
      (let [fns (mapv stripper (mc/children schema))]
        (when (some some? fns)
          (fn [v]
            (if (vector? v)
              (map-elements (let [i (volatile! -1)]
                              (fn [x]
                                (let [f (get fns (vswap! i inc))]
                                  (if f (f x) x))))
                            v)
              v))))

      :map-of
      (when-let [f (stripper (second (mc/children schema)))]
        (fn [m]
          (if (map? m)
            (reduce-kv (fn [acc k v]
                         (let [v' (f v)]
                           (if (identical? v v') acc (assoc acc k v'))))
                       m m)
            m)))

      (when (mc/-ref-schema? schema)
        (let [f (delay (stripper (mc/deref schema) extra-keys))]
          (fn [v]
            (if-let [f @f]
              (f v)
              v)))))))

(defn stripper
  "A function that removes from a value the keys the map schemas of `schema` do not declare, or nil when there are
  none to remove. A map that is `{:closed false}`, declares no keys, or has a `::mc/default` entry keeps its keys."
  ([schema]
   (stripper schema #{}))
  ([schema extra-keys]
   (first (mr/cached ::stripper [schema extra-keys] #(vector (stripper* schema extra-keys))))))

(defn strip
  "Remove from `value` the keys the map schemas of `schema` do not declare."
  [schema value]
  (if-let [f (stripper schema)]
    (f value)
    value))
