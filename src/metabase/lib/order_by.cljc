(ns metabase.lib.order-by
  (:require
   [metabase.lib.append :as lib.append]
   [metabase.lib.deflate :as lib.deflate]
   [metabase.lib.inflate :as lib.inflate]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(comment metabase.lib.schema/keep-me)

(def OrderByInfo
  [:map
   [:type [:= ::order-by]]
   [:direction :mbql/order-by-direction]
   [:ref [:fn any?]]])

(mu/defn order-by :- OrderByInfo
  ([ref]
   (order-by ref :asc))
  ([ref direction :- :mbql/order-by-direction]
   {:type      ::order-by
    :direction direction
    :ref       ref}))

(defmethod lib.deflate/deflate ::order-by
  [metadata {:keys [direction ref]}]
  [direction (lib.deflate/deflate metadata ref)])

;;; TODO -- appending a duplicate order-by should no-op.
(defmethod lib.append/append* ::order-by
  [metadata inner-query x]
  (update inner-query :order-by (fn [order-bys]
                                  (conj (vec order-bys) (lib.deflate/deflate metadata x)))))

(defmethod lib.inflate/inflate :mbql/asc
  [db-metadata [direction ref]]
  {:type      ::order-by
   :direction direction
   :ref       (lib.inflate/inflate db-metadata ref)})

(defmethod lib.inflate/inflate :mbql/desc
  [db-metadata [direction ref]]
  {:type      ::order-by
   :direction direction
   :ref       (lib.inflate/inflate db-metadata ref)})

(mu/defn order-bys :- [:sequential OrderByInfo]
  "Get the order-by clauses in a query."
  ([query :- lib.query/Query]
   (order-bys query -1))
  ([query :- lib.query/Query
    stage :- [:int]]
   (get (lib.util/query-stage query stage) :order-by)
   (not-empty
    (mapv (partial lib.inflate/inflate (lib.query/metadata query))
          (get (lib.util/query-stage query stage) :order-by)))))
