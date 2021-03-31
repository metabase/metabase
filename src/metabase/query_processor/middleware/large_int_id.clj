(ns metabase.query-processor.middleware.large-int-id
  "Middleware for handling conversion of IDs to strings for proper display of large numbers"
  (:require [metabase.mbql.util :as mbql.u]
            [metabase.models.field :refer [Field]]
            [toucan.db :as db]))

(defn- result-int->string
  [field-indexes rf]
  ((map (fn [row]
          (reduce #(update (vec %1) %2 str) row field-indexes)))
   rf))

(defn convert-id-to-string
  "Converts any ID (:type/PK and :type/FK) in a result to a string to handle a number > 2^51
  or < -2^51, the JavaScript float mantissa. This will allow proper display of large numbers,
  like IDs from services like social media. All ID numbers are converted to avoid the performance
  penalty of a comparison based on size."
  [qp]
  (fn [{{:keys [js-int-to-string?] :or {js-int-to-string? false}} :middleware, :as query} rff context]
    ;; currently, this excludes `:field` w/ name clauses, aggregations, etc.
    ;;
    ;; for a query like below, *no* conversion will occur
    ;;
    ;;    (mt/mbql-query venues
    ;;                 {:source-query {:source-table $$venues
    ;;                                 :aggregation  [[:aggregation-options
    ;;                                                 [:avg $id]
    ;;                                                 {:name "some_generated_name", :display-name "My Cool Ag"}]]
    ;;                                 :breakout     [$price]}})
    ;;
    ;; when you run in this fashion, you lose the ability to determine if it's an ID - you get a `:fields` value like:
    ;;
    ;;    [[:field "PRICE" {:base-type :type/Integer}] [:field "some_generated_name" {:base-type :type/BigInteger}]]
    ;;
    ;; so, short of turning all `:type/Integer` derived values into strings, this is the best approximation of a fix
    ;; that can be accomplished.
    (let [rff' (when js-int-to-string?
                 (when-let [field-indexes (not-empty
                                           (keep-indexed
                                            (fn [idx val]
                                              ;; TODO -- we could probably fix the rest of #5816 by adding support for
                                              ;; `:field` w/ name and removing the PK/FK requirements -- might break
                                              ;; the FE client tho.
                                              (when-let [field (mbql.u/match-one val
                                                                 [:field (field-id :guard integer?) _]
                                                                 ;; TODO -- can't we use the QP store here? Seems like
                                                                 ;; we should be able to, but it doesn't work (not
                                                                 ;; initialized)
                                                                 (db/select-one [Field :base_type :semantic_type]
                                                                   :id field-id))]
                                                (when (and (or (isa? (:semantic_type field) :type/PK)
                                                               (isa? (:semantic_type field) :type/FK))
                                                           (or (isa? (:base_type field) :type/Integer)
                                                               (isa? (:base_type field) :type/Number)))
                                                  idx)))
                                            (:fields (:query query))))]
                   (fn [metadata]
                     (result-int->string field-indexes (rff metadata)))))]
      (qp query (or rff' rff) context))))
