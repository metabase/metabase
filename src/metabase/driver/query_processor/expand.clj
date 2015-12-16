(ns metabase.driver.query-processor.expand
  "Converts a Query Dict as recieved by the API into an *expanded* one that contains extra information that will be needed to
   construct the appropriate native Query, and perform various post-processing steps such as Field ordering."
  (:refer-clojure :exclude [< <= > >= = != and or filter count distinct sum])
  (:require (clojure [core :as core]
                     [string :as s])
            [metabase.driver :as driver]
            [metabase.driver.query-processor.interface :refer [*driver*], :as i]))

;; *driver* is always bound when running queries the normal way, e.g. via `metabase.driver/process-query`
;; It is not neccesarily bound when using various functions like `fk->` in the REPL.
;; The check is not performed in those cases to allow flexibility when composing queries for tests or interactive development
(defn- assert-driver-supports
  "When `*driver*` is bound, assert that is supports keyword FEATURE."
  [feature]
  (when *driver*
    (when-not (contains? (driver/features *driver*) feature)
      (throw (Exception. (str (name feature) " is not supported by this driver."))))))

;;; # ------------------------------------------------------------ Token dispatch ------------------------------------------------------------

(defn- normalize-token [token]
  (when-not (core/or (keyword? token) (string? token))
    (throw (Exception. (str "Invalid token: " token))))
  (-> (name token)
      s/lower-case
      (s/replace #"_" "-")
      keyword))

(def ^:private ^:const dispatchable-tokens
  #{;; top-level
    :aggregation :breakout :filter :fields :order-by :source-table :limit :page
    ;; aggregation subclauses
    :count :avg :distinct :stddev :sum :cum-sum
    ;; filter subclauses
    :and :or :inside :between := :!= :< :> :<= :>= :starts-with :contains :ends-with :time-interval
    ;; fields
    :fk-> :datetime-field
    ;; values
    :relative-datetime})

(defn- apply-fn-for-token
  ([token+args]
   (apply-fn-for-token (first token+args) (rest token+args)))
  ([token args]
   (let [token (normalize-token token)
         f     (core/or (when (contains? dispatchable-tokens token)
                          (ns-resolve 'metabase.driver.query-processor.expand (symbol (name token))))
                        (throw (Exception. (str "Illegal clause (no matching fn found): " token))))]
     (apply f args))))


;;; # ------------------------------------------------------------ Clause Handlers ------------------------------------------------------------

(defn aggregate-field [index]
  (i/->OrderByAggregateField :aggregation index))

(defn field [f] l
  (cond
    (map?     f) f
    (integer? f) (i/map->FieldPlaceholder {:field-id f})
    (vector?  f) (let [[token & args] f]
                   (if (core/= (normalize-token token) :aggregation)
                     (apply aggregate-field args)
                     (apply-fn-for-token token args)))
    :else        (throw (Exception. (str "Invalid field: " f)))))

(defn datetime-field
  ([f _ unit] (datetime-field f unit))
  ([f unit]   (assoc (field f) :datetime-unit (normalize-token unit))))

(defn fk-> [fk-field-id dest-field-id]
  (assert-driver-supports :foreign-keys)
  (i/map->FieldPlaceholder {:fk-field-id fk-field-id, :field-id dest-field-id}))


(defn value [f v]
  (cond
    (map?    v) v
    (vector? v) (apply-fn-for-token (first v) (cons f (rest v)))
    :else       (i/map->ValuePlaceholder {:field-placeholder (field f), :value v})))

(defn relative-datetime
  ([f]        (relative-datetime f 0 nil))
  ([f _]      (relative-datetime f 0 nil))
  ([f n unit] (i/map->ValuePlaceholder {:field-placeholder (field f), :value (if (zero? n)
                                                                               ["relative_datetime" "current"]
                                                                               ["relative_datetime" n (normalize-token unit)])})))


;;; ## aggregation

(defn- ag-with-field [ag-type f]
  {:aggregation-type ag-type, :field (field f)})

(def ^{:arglists '([f])} avg      (partial ag-with-field :avg))
(def ^{:arglists '([f])} distinct (partial ag-with-field :distinct))
(def ^{:arglists '([f])} sum      (partial ag-with-field :sum))
(def ^{:arglists '([f])} cum-sum  (partial ag-with-field :cumulative-sum))

(defn stddev [f]
  (assert-driver-supports :standard-deviation-aggregations)
  (ag-with-field :stddev f))

(defn count
  ([]  {:aggregation-type :count})
  ([f] (ag-with-field :count f)))

(defn aggregation [query ag-type & args]
  (let [ag-type (normalize-token ag-type)]
    (when-not (core/= ag-type :rows)
      (assoc query :aggregation (apply-fn-for-token ag-type args)))))


;;; ## breakout & fields

(defn- fields-list-clause [k query & fields] (assoc query k (mapv field fields)))

(def ^{:arglists '([query & fields])} breakout (partial fields-list-clause :breakout))
(def ^{:arglists '([query & fields])} fields   (partial fields-list-clause :fields))

;;; ## filter

(declare expand-filter-subclause-if-needed)

(defn- compound-filter
  ([_ subclause] (expand-filter-subclause-if-needed subclause))
  ([compound-type subclause & more]
   {:compound-type compound-type, :subclauses (mapv expand-filter-subclause-if-needed (cons subclause more))}))

(def ^{:arglists '([& subclauses])} and (partial compound-filter :and))
(def ^{:arglists '([& subclauses])} or  (partial compound-filter :or))

(defn- equality-filter
  ([filter-type _ f v]
   {:filter-type filter-type, :field (field f), :value (value f v)})
  ([filter-type compound-fn f v & more]
   (apply compound-fn (for [v (cons v more)]
                        (equality-filter filter-type compound-fn f v)))))

(def ^{:arglists '([f v & more])} =  (partial equality-filter :=  or))
(def ^{:arglists '([f v & more])} != (partial equality-filter :!= and))

(defn- comparison-filter [filter-type f v]
  {:filter-type filter-type, :field (field f), :value (value f v)})

(def ^{:arglists '([f v])} <  (partial comparison-filter :<))
(def ^{:arglists '([f v])} <= (partial comparison-filter :<=))
(def ^{:arglists '([f v])} >  (partial comparison-filter :>))
(def ^{:arglists '([f v])} >= (partial comparison-filter :>=))

(defn between [f min max]
  {:filter-type :between, :field (field f), :min-val (value f min), :max-val (value f max)})

(defn inside [lat-field lon-field lat-max lon-min lat-min lon-max]
  {:filter-type :inside
   :lat         {:field (field lat-field)
                 :min   (value lat-field lat-min)
                 :max   (value lat-field lat-max)}
   :lon         {:field (field lon-field)
                 :min   (value lon-field lon-min)
                 :max   (value lon-field lon-max)}})

(defn- string-filter [filter-type f s]
  {:filter-type filter-type, :field (field f), :value (value f s)})

(def ^{:arglists '([f s])} starts-with (partial string-filter :starts-with))
(def ^{:arglists '([f s])} contains    (partial string-filter :contains))
(def ^{:arglists '([f s])} ends-with   (partial string-filter :ends-with))

(defn time-interval [f n unit]
  (if-not (integer? n)
    (let [n (normalize-token n)]
      (case n
        :current (recur f  0 unit)
        :last    (recur f -1 unit)
        :next    (recur f  1 unit)))
    (let [f (datetime-field f unit)]
      (cond
        (core/= n  0) (= f (relative-datetime f))
        (core/= n -1) (= f (relative-datetime f -1 unit))
        (core/= n  1) (= f (relative-datetime f  1 unit))
        (core/< n -1) (between f (relative-datetime f (dec n) unit) (relative-datetime f -1 unit))
        (core/> n  1) (between f (relative-datetime f 1 unit) (relative-datetime f (inc n) unit))))))

(defn- expand-filter-subclause-if-needed [subclause]
  (cond
    (vector? subclause) (apply-fn-for-token subclause)
    (map? subclause)    subclause))

(defn filter
  ([query filter-map]
   (assoc query :filter filter-map))
  ([query filter-type & args]
   (filter query (apply-fn-for-token filter-type args))))

(defn limit [query limit]
  (assoc query :limit limit))


;;; ## order-by

(defn- maybe-parse-order-by-subclause [subclause]
  (cond
    (map? subclause)    subclause
    (vector? subclause) (let [[f direction] subclause]
                          {:field (field f), :direction (normalize-token direction)})
    :else               (throw (Exception. (str "Invald order-by subclause: " subclause)))))

(defn order-by [query & subclauses]
  (assoc query :order-by (mapv maybe-parse-order-by-subclause subclauses)))


;;; ## page

(defn- page [query page-clause]
  (assoc query :page page-clause))

;;; ## source-table

(defn source-table [query table-id]
  (assoc query :source-table table-id))


;;; # ------------------------------------------------------------ Expansion ------------------------------------------------------------

(defn- expand-inner [inner-query]
  (loop [query {}, [[clause-name arg] & more] (seq inner-query)]
    (let [args  (cond
                  (sequential? arg) arg
                  arg               [arg])
          query (core/or (when (seq args)
                           (apply-fn-for-token clause-name (cons query args)))
                         query)]
      (if (seq more)
        (recur query more)
        query))))

(defn expand [outer-query]
  (update outer-query :query expand-inner))

(defmacro query
  {:style/indent 0}
  [& body]
  (let [query (gensym "query-")]
    `(let [~query {}
           ~@(mapcat (fn [clause]
                       `[~query (core/or (-> ~query ~clause) ~query)])
                     body)]
       ~query)))
