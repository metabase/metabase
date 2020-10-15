(ns metabase.query-processor.middleware.large-int-id
  "Middleware for handling conversion of IDs to strings for proper display of large numbers"
  (:require [metabase.mbql.util :as mbql.u]
            [metabase.models.field :refer [Field]]))

(defn- result-int->string
  [field-indexes rf]
  (fn
    ([] (rf))
    ([result] (rf result))
    ([result row]
     (rf result (reduce #(update (vec %1) %2 str) row field-indexes)))))

(defn convert-id-to-string
  "Converts any ID (:type/PK and :type/FK) in a result to a string to handle a number > 2^51
  or < -2^51, the JavaScript float mantissa. This will allow proper display of large numbers,
  like IDs from services like social media. All ID numbers are converted to avoid the performance
  penalty of a comparison based on size."
  [qp]
  (fn [{{:keys [js-int-to-string?] :or {js-int-to-string? false}} :middleware, :as query} rff context]
    ;; currently, this excludes `:field-literal` values like aggregations.
    ;;
    ;; for a query like below, *no* conversion will occur
    ;; (mt/mbql-query venues
    ;;              {:source-query {:source-table $$venues
    ;;                              :aggregation  [[:aggregation-options
    ;;                                              [:avg $id]
    ;;                                              {:name "some_generated_name", :display-name "My Cool Ag"}]]
    ;;                              :breakout     [$price]}})
    ;; when you run in this fashion, you lose the ability to determine if it's an ID - you get a `:fields` value
    ;; like: `:fields [[:field-literal "PRICE" :type/Integer] [:field-literal "some_generated_name" :type/BigInteger]]`
    ;; so, short of turning all `:type/Integer` derived values into strings, this is the best approximation
    ;; of a fix that can be accomplished.
    (let [field-indexes (keep-indexed
                          (fn [idx val]
                            (let [field-id (mbql.u/field-clause->id-or-literal val)]
                              (when-let [field (when (number? field-id)
                                                 (Field field-id))]
                                (when (and (or (isa? (:special_type field) :type/PK)
                                               (isa? (:special_type field) :type/FK))
                                           (isa? (:base_type field) :type/Integer))
                                  idx))))
                          (:fields (:query query)))]
      (qp query (if (and js-int-to-string? (seq field-indexes))
                  #(result-int->string field-indexes (rff %))
                  rff)
          context))))
