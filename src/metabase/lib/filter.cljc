(ns metabase.lib.filter
  (:refer-clojure :exclude [filter and or not = < <= > ->> >= not-empty case])
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.field :as lib.field]
   [metabase.lib.options :as lib.options]
   metabase.lib.schema.filter
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu])
  #?(:cljs (:require-macros [metabase.lib.filter])))

(comment metabase.lib.schema.filter/keep-me)

(defmulti ^:private ->filter-arg
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x)))

(defmethod ->filter-arg :default
  [query stage-number x]
  x)

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
     (let [filter-name-str (name filter-name)
           vararg? (.contains ^java.util.Collection argvec '&)
           args (remove #{'&} argvec)
           arglist-expr (if vararg?
                          (cons 'list* args)
                          argvec)]
       `(do
          (mu/defn ~filter-name :- ~(keyword "mbql.clause" filter-name-str)
            ~(format "Create a filter clause of type `%s`." filter-name-str)
            [~'query ~'stage-number ~@argvec]
            (-> (into [~(keyword filter-name)]
                      (map (fn [~'arg]
                             (->filter-arg ~'query ~'stage-number ~'arg)))
                      ~arglist-expr)
                metabase.lib.options/ensure-uuid))

          (mu/defn ~(symbol (str "->" filter-name-str)) :- fn?
            ~(format "Return function creating a filter clause of type `%s`." filter-name-str)
            ~argvec
            (fn [~'query ~'stage-number]
              ~(cond->> (concat [filter-name 'query 'stage-number] args)
                 vararg? (cons `apply))))))))

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

(defmulti ^:private ->filter-clause
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x)))

(defmethod ->filter-clause :default
  [query stage-number x]
  (if (vector? x)
    (-> (mapv #(clojure.core/->> %
                                 (->filter-arg query stage-number)
                                 (->filter-clause query stage-number)) x)
        lib.options/ensure-uuid)
    x))

(defmethod ->filter-clause :dispatch-type/fn
  [query stage-number f]
  (->filter-clause query stage-number (f query stage-number)))

(mu/defn filter :- :metabase.lib.schema/query
  "Sets `boolean-expression` as a filter on `query`."
  ([query boolean-expression]
   (metabase.lib.filter/filter query -1 boolean-expression))

  ([query stage-number boolean-expression]
   (let [stage-number (clojure.core/or stage-number -1)
         new-filter   (->filter-clause query stage-number boolean-expression)]
     (lib.util/update-query-stage query stage-number assoc :filter new-filter))))
