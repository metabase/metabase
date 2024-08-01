(ns metabase.lib.schema.filter
  "Schemas for the various types of filter clauses that you'd pass to `:filters` or use inside something else that takes
  a boolean expression."
  (:require
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.id :as id]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.lib.schema.temporal-bucketing :as temporal-bucketing]
   [metabase.util.malli.registry :as mr]))

(defn- tuple-clause-of-comparables-schema
  "Helper intended for use with [[define-mbql-clause]]. Create a clause schema with `:tuple` and ensure that
  the elements of `args` at positions specified by the pairs in `compared-position-pairs` can be compared."
  [compared-position-pairs]
  (fn [tag & args]
    {:pre [(simple-keyword? tag)]}
    [:and
     (apply mbql-clause/tuple-clause-schema tag args)
     [:fn
      {:error/message "arguments should be comparable"}
      (fn [[_tag _opts & args]]
        (let [argv (vec args)]
          (or expression/*suppress-expression-type-check?*
              (every? true? (map (fn [[i j]]
                                   (expression/comparable-expressions? (get argv i) (get argv j)))
                                 compared-position-pairs)))))]]))

(doseq [op [:and :or]]
  (mbql-clause/define-catn-mbql-clause op :- :type/Boolean
    [:args [:repeat {:min 2} [:schema [:ref ::expression/boolean]]]]))

(mbql-clause/define-tuple-mbql-clause :not :- :type/Boolean
  [:ref ::expression/boolean])

(doseq [op [:= :!=]]
  (mbql-clause/define-catn-mbql-clause op :- :type/Boolean
    [:args [:repeat {:min 2} [:schema [:ref ::expression/equality-comparable]]]]))

(doseq [op [:< :<= :> :>=]]
  (mbql-clause/define-mbql-clause-with-schema-fn (tuple-clause-of-comparables-schema #{[0 1]})
    op :- :type/Boolean
    #_x [:ref ::expression/orderable]
    #_y [:ref ::expression/orderable]))

(mbql-clause/define-mbql-clause-with-schema-fn (tuple-clause-of-comparables-schema #{[0 1] [0 2]})
  :between :- :type/Boolean
  ;; TODO -- should we enforce that min is <= max (for literal number values?)
  #_expr [:ref ::expression/orderable]
  #_min  [:ref ::expression/orderable]
  #_max  [:ref ::expression/orderable])

;; sugar: a pair of `:between` clauses
(mbql-clause/define-mbql-clause-with-schema-fn (tuple-clause-of-comparables-schema #{[0 2] [0 4] [1 3] [1 5]})
  :inside :- :type/Boolean
  ;; TODO -- should we enforce that lat-min <= lat-max and lon-min <= lon-max? Should we enforce that -90 <= lat 90
  ;; and -180 <= lon 180 ?? (for literal number values)
  #_lat-expr [:ref ::expression/orderable]
  #_lon-expr [:ref ::expression/orderable]
  #_lat-max  [:ref ::expression/orderable]  ; north
  #_lon-min  [:ref ::expression/orderable]  ; west
  #_lat-min  [:ref ::expression/orderable]  ; south
  #_lon-max  [:ref ::expression/orderable]) ; east

;;; null checking expressions
;;;
;;; these are sugar for [:= ... nil] and [:!= ... nil] respectively
(doseq [op [:is-null :not-null]]
  (mbql-clause/define-tuple-mbql-clause op :- :type/Boolean
    [:ref ::expression/expression]))

;;; :is-empty is sugar for [:or [:= ... nil] [:= ... ""]] for emptyable arguments
;;; :not-empty is sugar for [:and [:!= ... nil] [:!= ... ""]] for emptyable arguments
;;; For non emptyable arguments expansion is same with :is-null and :not-null
(doseq [op [:is-empty :not-empty]]
  (mbql-clause/define-tuple-mbql-clause op :- :type/Boolean
    [:ref ::expression/expression]))

(def ^:private string-filter-options
  [:map [:case-sensitive {:optional true} :boolean]]) ; default true

;; N-ary [:ref ::expression/string] filter clauses. These also accept a `:case-sensitive` option.
;; Requires at least 2 string-shaped args. If there are more than 2, `[:contains x a b]` is equivalent to
;; `[:or [:contains x a] [:contains x b]]`.
;;
;; `[:does-not-contain ...]` = `[:not [:contains ...]]`
(doseq [op [:starts-with :ends-with :contains :does-not-contain]]
  (mbql-clause/define-mbql-clause op :- :type/Boolean
    [:schema [:catn {:error/message (str "Valid " op " clause")}
              [:tag [:= {:decode/normalize common/normalize-keyword} op]]
              [:options [:merge ::common/options string-filter-options]]
              [:args [:repeat {:min 2} [:schema [:ref ::expression/string]]]]]]))

(def ^:private time-interval-options
  [:map [:include-current {:optional true} :boolean]]) ; default false

;; SUGAR: rewritten as a filter clause with a relative-datetime value
(mbql-clause/define-mbql-clause :time-interval :- :type/Boolean
  ;; TODO -- we should probably further constrain this so you can't do weird stuff like
  ;;
  ;;    [:time-interval {} <time> :current :year]
  ;;
  ;; using units that don't agree with the expr type
  [:tuple
   [:= {:decode/normalize common/normalize-keyword} :time-interval]
   [:merge ::common/options time-interval-options]
   #_expr [:ref ::expression/temporal]
   #_n    [:multi
           {:dispatch (some-fn keyword? string?)}
           [true  [:enum {:decode/normalize common/normalize-keyword} :current :last :next]]
           ;; I guess there's no reason you shouldn't be able to do something like 1 + 2 in here
           [false [:ref ::expression/integer]]]
   #_unit [:ref ::temporal-bucketing/unit.date-time.interval]])

(mbql-clause/define-mbql-clause :relative-time-interval :- :type/Boolean
  [:tuple
   [:= {:decode/normalize common/normalize-keyword} :relative-time-interval]
   ;; `relative-time-interval` does not support options to eg. include/exclude start or end point. Only int values
   ;; are allowed for intervals.
   ::common/options
   #_col           [:ref ::expression/temporal]
   #_value         :int
   #_bucket        [:ref ::temporal-bucketing/unit.date-time.interval]
   #_offset-value  :int
   #_offset-bucket [:ref ::temporal-bucketing/unit.date-time.interval]])

;; segments are guaranteed to return valid filter clauses and thus booleans, right?
(mbql-clause/define-mbql-clause :segment :- :type/Boolean
  [:tuple
   [:= {:decode/normalize common/normalize-keyword} :segment]
   ::common/options
   [:multi
    {:dispatch string?}
    [true  ::common/non-blank-string]
    [false ::id/segment]]])

(mr/def ::operator
  [:map
   [:lib/type [:= :operator/filter]]
   [:short [:enum := :!= :inside :between :< :> :<= :>= :is-null :not-null :is-empty :not-empty :contains :does-not-contain :starts-with :ends-with]]
   ;; this is used for display name and it depends on the arguments to the filter clause itself... e.g.
   ;;
   ;; number_a < number_b
   ;;
   ;; gets a display name of "less than" for the operator, while
   ;;
   ;; timestamp_a < timestamp_b
   ;;
   ;; gets a display name of "before" for the operator. We don't want to encode the display name in the `::operator`
   ;; definition itself, because it forces us to do i18n in the definition itself; it's nicer to have static
   ;; definitions and only add the display name when we call `display-name` or `display-info`.
   [:display-name-variant :keyword]])
