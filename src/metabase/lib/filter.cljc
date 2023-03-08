(ns metabase.lib.filter
  (:refer-clojure :exclude [and or not = < <= > >= not-empty case])
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.field :as lib.field]
   metabase.lib.options
   metabase.lib.schema.filter
   #?(:clj [metabase.util.malli :as mu]))
  #?(:cljs (:require-macros [metabase.lib.filter])))

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

#?(:clj
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
              metabase.lib.options/ensure-uuid)))))

(metabase.lib.filter/deffilter and [x y & more])
(metabase.lib.filter/deffilter or [x y & more])
(metabase.lib.filter/deffilter not [x])
(metabase.lib.filter/deffilter = [x y & more])
(metabase.lib.filter/deffilter != [x y & more])
(metabase.lib.filter/deffilter < [x y])
(metabase.lib.filter/deffilter <= [x y])
(metabase.lib.filter/deffilter > [x y])
(metabase.lib.filter/deffilter >= [x y])
(metabase.lib.filter/deffilter between [x lower upper])
(metabase.lib.filter/deffilter inside [lat lon lat-max lon-min lat-min lon-max])
(metabase.lib.filter/deffilter is-null [x])
(metabase.lib.filter/deffilter not-null [x])
(metabase.lib.filter/deffilter is-empty [x])
(metabase.lib.filter/deffilter not-empty [x])
(metabase.lib.filter/deffilter starts-with [whole part])
(metabase.lib.filter/deffilter ends-with [whole part])
(metabase.lib.filter/deffilter contains [whole part])
(metabase.lib.filter/deffilter does-not-contain [whole part])
(metabase.lib.filter/deffilter time-interval [x amount unit])
(metabase.lib.filter/deffilter segment [segment-id])
(metabase.lib.filter/deffilter case [& pred-exprs])
