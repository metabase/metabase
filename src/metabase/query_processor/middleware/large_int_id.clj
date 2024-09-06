(ns metabase.query-processor.middleware.large-int-id
  "Middleware for handling conversion of IDs to strings for proper display of large numbers"
  (:require
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.performance :as perf]))

(defn- ->string [x]
  (when x
    (str x)))

(defn- result-int->string
  [field-mask rf]
  ((map (fn [row]
          (perf/mapv #(if %2 (->string %1) %1) row field-mask)))
   rf))

(defn- should-convert-to-string? [field]
  (and (or (isa? (:semantic-type field) :type/PK)
           (isa? (:semantic-type field) :type/FK))
       (or (isa? (:base-type field) :type/Integer)
           (isa? (:base-type field) :type/Number))))

(defn- field-index-mask
  "Return a mask of booleans for each field. If the mask for the field is true, it should be converted to string."
  [fields]
  (let [mask
        (mapv
         (fn [val]
           ;; TODO -- we could probably fix the rest of #5816 by adding support for
           ;; `:field` w/ name and removing the PK/FK requirements -- might break
           ;; the FE client tho.
           (when-let [field (lib.util.match/match-one val
                              [:field (field-id :guard integer?) _]
                              ;; TODO -- can't we use the QP store here? Seems like
                              ;; we should be able to, but it doesn't work (not
                              ;; initialized)
                              (lib.metadata.protocols/field (qp.store/metadata-provider) field-id))]
             (should-convert-to-string? field)))
         fields)]
    (when (some true? mask)
      mask)))

(defn convert-id-to-string
  "Converts any ID (:type/PK and :type/FK) in a result to a string to handle a number > 2^51
  or < -2^51, the JavaScript float mantissa. This will allow proper display of large numbers,
  like IDs from services like social media. All ID numbers are converted to avoid the performance
  penalty of a comparison based on size. NULLs are converted to Clojure nil/JS null."
  [{{:keys [js-int-to-string?] :or {js-int-to-string? false}} :middleware, :as query} rff]
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
               (when-let [mask (field-index-mask (:fields (:query query)))]
                 (fn [metadata]
                   (result-int->string mask (rff metadata)))))]
    (or rff' rff)))
