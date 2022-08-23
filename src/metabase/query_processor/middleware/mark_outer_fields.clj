(ns metabase.query-processor.middleware.mark-outer-fields
  (:require [clojure.walk :as walk]
            [medley.core :as m]
            [metabase.mbql.util :as mbql.u]))

(defn- annotate-outer-fields [form source-fields-names-or-ids]
  (mbql.u/replace form
    [:field (_ :guard source-fields-names-or-ids) _] (mbql.u/assoc-field-options &match :nested/outer true)))

(defn- mark-mbql-outer-fields
  [mbql-query]
  (walk/prewalk
   (fn [form]
     (let [source-fields (get-in form [:source-query :fields])]
       (if (and (map? form)
                (seqable? source-fields)
                (seq source-fields))
         (let [id-set (into #{} (map second) source-fields)]
           (-> form
               (m/update-existing :fields annotate-outer-fields id-set)
               (m/update-existing :breakout annotate-outer-fields id-set)
               (m/update-existing :order-by annotate-outer-fields id-set)))
         form)))
   mbql-query))

(defn mark-outer-fields
  "Mark all Fields in the MBQL query `query` coming from a source-query as `:nested/outer` so QP implementations know
  not to apply coercion or whatever to them a second time"
  [query]
  (cond-> query
    (not= (:type query) :native)
    (update :query mark-mbql-outer-fields)))
