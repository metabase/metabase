(ns metabase.lib.filter
  (:refer-clojure :exclude [and or not = < <= > >= not-empty case])
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.field :as lib.field]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema.filter :as lib.schema.filter]
   [metabase.util.malli :as mu]))

(defmulti ^:private ->filter-arg
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x)))

(defmethod ->filter-arg :default
  [query stage-number x]
  (if (vector? x)
    (mapv #(->filter-arg query stage-number %) x)
    x))

(defmethod ->filter-arg :metadata/field
  [query stage-number field-metadata]
  (lib.field/field query stage-number field-metadata))

(defmethod ->filter-arg :dispatch-type/fn
  [query stage-number f]
  (->filter-arg query stage-number (f query stage-number)))

(defmacro ^:private deffilter
  [filter-name argvec]
  {:pre [(symbol? filter-name)
         (vector? argvec) (every? symbol? argvec)
         (not-any? #{'query 'stage-number} argvec)]}
  (let [arglist-expr (if (.contains argvec '&)
                       (cons 'list* (remove #{'&} argvec))
                       argvec)]
    `(mu/defn ~filter-name :- ~(keyword "metabase.lib.schema.filter" (name filter-name))
       ~(format "Create a filter clause of type `%s`." (name filter-name))
       [~'query ~'stage-number ~@argvec]
       (-> (into [~(keyword filter-name)]
                 (map (fn [~'arg]
                   (->filter-arg ~'query ~'stage-number ~'arg)))
                 ~arglist-expr)
           lib.options/ensure-uuid))))

(deffilter and [x y & more])
(deffilter or [x y & more])
(deffilter not [x])
(deffilter = [x y & more])
(deffilter != [x y & more])
(deffilter < [x y])
(deffilter <= [x y])
(deffilter > [x y])
(deffilter >= [x y])
(deffilter between [x lower upper])
(deffilter inside [lat lon lat-max lon-min lat-min lon-max])
(deffilter is-null [x])
(deffilter not-null [x])
(deffilter is-empty [x])
(deffilter not-empty [x])
(deffilter starts-with [whole part])
(deffilter ends-with [whole part])
(deffilter contains [whole part])
(deffilter does-not-contain [whole part])
(deffilter time-interval [x amount unit])
(deffilter segment [segment-id])
(deffilter case [& pred-exprs])

;; TODO move to the dev namespace
(mu/defn ->= :- fn?
  "Return function creating an `=` filter clause."
  ([x y]
   (fn [query stage-number]
     (= query stage-number x y))))
