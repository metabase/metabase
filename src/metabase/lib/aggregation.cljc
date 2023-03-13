(ns metabase.lib.aggregation
  (:refer-clojure :exclude [count distinct max min])
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.field :as lib.field]
   [metabase.lib.options :as lib.options]
   metabase.lib.schema.expression
   [metabase.util.malli :as mu])
  #?(:cljs (:require-macros [metabase.lib.aggregation])))

;; TODO move to common code with filter/->filter-arg, these are expression args
(defmulti ^:private ->op-arg
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x)))

(defmethod ->op-arg :default
  [_query _stage-number x]
  x)

(defmethod ->op-arg :metadata/field
  [query stage-number field-metadata]
  (lib.field/field query stage-number field-metadata))

(defmethod ->op-arg :dispatch-type/fn
  [query stage-number f]
  (->op-arg query stage-number (f query stage-number)))

#?(:clj
   (defmacro ^:private defop
     [op-name argvec]
     {:pre [(symbol? op-name)
            (vector? argvec) (every? symbol? argvec)
            (not-any? #{'query 'stage-number} argvec)]}
     (let [arglist-expr (if (.contains argvec '&)
                          (cons 'list* (remove #{'&} argvec))
                          argvec)]
       `(mu/defn ~op-name :- [:or fn? ~(keyword "mbql.clause" (name op-name))]
          ~(format "Create a clause of type `%s`." (name op-name))
          ([~@argvec]
           (fn [~'query ~'stage-number]
             (~op-name ~'query ~'stage-number ~@argvec)))
          ([~'query ~'stage-number ~@argvec]
           (-> (into [~(keyword op-name)]
                     (map (fn [~'arg]
                            (->op-arg ~'query ~'stage-number ~'arg)))
                     ~arglist-expr)
               metabase.lib.options/ensure-uuid))))))

(mu/defn count :- [:or
                   fn?
                   :mbql.clause/count]
  "Create a `count` filter clause."
  ([]
   #_{:clj-kondo/ignore [:redundant-fn-wrapper]}
   (fn [query stage-number]
     (count query stage-number)))
  ([x]
   (fn [query stage-number]
     (count query stage-number x)))
  ([_query _stage-number]
   (lib.options/ensure-uuid [:count]))
  ([query stage-number x]
   (lib.options/ensure-uuid [:count (->op-arg query stage-number x)])))

(defop avg [x])
(defop count-where [x y])
(defop distinct [x])
(defop max [x])
(defop median [x])
(defop min [x])
(defop percentile [x y])
(defop share [x])
(defop stddev [x])
(defop sum [x])
(defop sum-where [x y])
