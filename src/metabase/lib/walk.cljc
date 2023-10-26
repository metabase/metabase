(ns metabase.lib.walk
  (:require
   [clojure.string :as str]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.util :as lib.util]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.lib.schema :as lib.schema]))

(defmulti ^:private walk*
  {:arglists '([x f context])}
  (fn [x _f _context]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

(defn- walk-sequence
  "Walk every item in sequence `xs` by calling

    (f x context)

  for each item. Adds index of each item to the `:path`. Finally, calls

    (f xs context)

  on the updated `xs`. Returns `xs` as-is if no changes are made in any calls to `f`."
  [xs f context]
  (transduce
   identity
   (fn
     ([xs]
      (f xs context))
     ([xs index]
      (let [x  (nth xs index)
            x' (walk* x f (update context :path #(conj (vec %) index)))]
        (if (identical? x x')
          xs
          (assoc xs index x')))))
   xs
   (range (count xs))))

(defn- walk-mbql-expression
  "Like [[walk-sequence]], but ignores the first two items (MBQL clause tag and MBQL clause context)."
  [clause f {:keys [path], :as context}]
  (let [ignored-paths #{(conj (vec path) 0)
                        (conj (vec path) 1)}
        f'            (fn [x context]
                        (if (ignored-paths (:path context))
                          x
                          (f x context)))]
    (walk-sequence clause f' context)))

(defmethod walk* :default
  [x f context]
  (if (lib.util/clause? x)
    (walk-mbql-expression x f context)
    (f x context)))

(defmethod walk* :dispatch-type/sequential
  [xs f context]
  (walk-sequence xs f context))

(defn- walk-map-key [m f k context]
  (let [v (get m k)]
    (if-not (some? v)
      m
      (let [v' (walk* v f (update context :path #(conj (vec %) k)))]
        (if (identical? v v')
          m
          (assoc m k v'))))))

(defmethod walk* :mbql/query
  [query f context]
  (let [context (assoc context :query query)]
    (-> query
        (walk-map-key f :stages context)
        (f context))))

(defmethod walk* :mbql.stage/mbql
  [stage f context]
  (transduce
   identity
   (fn
     ([stage']
      (f stage' context))
     ([stage k]
      (walk-map-key stage f k context)))
   stage
   [:joins
    :expressions
    :breakout
    :aggregation
    :fields
    :filters
    :order-by]))

(defmethod walk* :mbql/join
  [join f context]
  (transduce
   (filter some?)
   (fn
     ([join']
      (f join' context))
     ([join k]
      (let [context (update context :query (fn [query]
                                             (assoc query :stages (:stages join))))]
        (walk-map-key join f k context))))
   join
   [:stages
    :conditions
    (when (sequential? (:fields join))
      :fields)]))

;; do not recurse into the args to `:field`/`:expression`/`:aggregation` ref clauses
(defmethod walk* ::lib.schema.ref/ref
  [a-ref f context]
  (f a-ref context))

(defn walk
  ([x f]
   (walk x f nil))

  ([x f context]
   (walk* x
          (fn [x context]
            (log/debugf "Walk %s%s %s"
                        (if (seq (:path context))
                          (str (str/join (repeat (dec (count (:path context))) " │ "))
                               " ├─ ")
                          "")
                        (lib.dispatch/dispatch-value x)
                        (pr-str context))
            (f x context))
          (merge {:path []} context))))

(defn walk-only
  ([dispatch-values-set x f]
   (walk-only dispatch-values-set x f nil))

  ([dispatch-values-set x f context]
   (walk
    x
    (fn [form context]
      (if (dispatch-values-set (lib.dispatch/dispatch-value form))
        (f form context)
        form))
    context)))

(defn walk-stages
  ([x f]
   (walk-stages x f nil))

  ([x f context]
   (walk-only #{:mbql.stage/mbql :mbql.stage/native} x f context)))

(defn walk-stages-and-joins
  ([x f]
   (walk-stages-and-joins x f nil))

  ([x f context]
   (walk-only #{:mbql.stage/mbql :mbql.stage/native :mbql/join} x f context)))

(defn walk-refs
  ([x f]
   (walk-refs x f nil))

  ([x f context]
   (walk-only #{:field :expression :aggregation} x f context)))
