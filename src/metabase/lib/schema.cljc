(ns metabase.lib.schema
  (:require
   [metabase.shared.util.i18n :as i18n]
   [metabase.types]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [malli.core :as mc]
   [malli.util :as mut]))

(comment metabase.types/keep-me)

(mr/def :lib/options
  [:map
   [:lib/uuid ms/NonBlankString]])

(mr/def :mbql/date-bucketing-unit
  [:enum :default :day :day-of-week :day-of-month :day-of-year :week :week-of-year
   :month :month-of-year :quarter :quarter-of-year :year])

(mr/def :mbql/time-bucketing-unit
  [:enum :default :millisecond :second :minute :minute-of-hour :hour :hour-of-day])

(mr/def :mbql/datetime-bucketing-unit
  [:or
   :mbql/date-bucketing-unit
   :mbql/time-bucketing-unit])

(mr/def :mbql/field-options
  [:and
   :lib/options
   [:map
    [:temporal-unit {:optional true} :mbql/datetime-bucketing-unit]]])

(mr/def :mbql/field-ref
  [:and
   [:catn
    [:clause [:= :field]]
    [:id-or-name [:altn
                  [:id ms/IntGreaterThanZero]
                  [:name ms/NonBlankString]]]
    [:options :mbql/field-options]]
   [:fn (fn [[_field id-or-name options]]
          (or (integer? id-or-name)
              (and (string? id-or-name)
                   (isa? (:base-type options) :type/*))))]])

(mr/def :mbql/aggregation-ref
  [:catn
   [:clause [:= :aggregation]]
   [:index ms/IntGreaterThanZero]])

(mr/def :mbql/expression-ref
  [:catn
   [:clause [:= :expression]]
   [:name ms/NonBlankString]])

;; this is a placeholder that will be resolved later once we have metadata and `append` it to the query. Used to
;; implement [[metabase.lib.field/field]] so you don't have to pass metadata to it directly.
(mr/def :lib/field-placeholder
  [:catn
   [:clause [:= :lib/field-placeholder]]
   [:info [:fn map?]]])

(mr/def :mbql/ref
  [:and
   [:catn
    [:clause [:keyword]]
    [:args   [:* any?]]]
   [:multi {:dispatch #(keyword (first %))}
    [:lib/field-placeholder :lib/field-placeholder]
    [:field :mbql/field-ref]
    [:aggregation :mbql/aggregation-ref]
    [:expression :mbql/expression-ref]]])

(mr/def :mbql/clause
  [:catn
   [:clause keyword?]
   [:options :lib/options]
   [:args [:* [:fn any?]]]])

(mr/def :mbql/=
  [:catn
   [:clause [:= :=]]
   [:options :lib/options]
   [:args [:+ {:min 2} :mbql/ref #_[:ref :mbql/expression]]]])

(mr/def :mbql/boolean-literal
  [:boolean])

(mr/def :mbql/boolean-expression
  [:or
   :mbql/boolean-literal
   :mbql/=])

;; TODO
(mr/def :mbql/expression
  [:or
   [:ref :mbql/ref]
   #_string-literal
   #_number-literal
   #_temporal-literal
   #_boolean-literal])

(mr/def :mbql/order-by-direction
  [:enum :asc :desc])

(mr/def :mbql/asc
  [:catn
   [:direction [:= :asc]]
   [:options :lib/options]
   [:ref :mbql/ref]])

(mr/def :mbql/desc
  [:catn
   [:direction [:= :desc]]
   [:options :lib/options]
   [:ref :mbql/ref]])

(mr/def :mbql/order-by
  [:or
   {:error/fn (fn [& _]
                (i18n/tru "Invalid order by clause"))}
   :mbql/asc
   :mbql/desc])

(mr/def ::source-table-or-source-query
  [:fn
   {:error/fn (fn [& _]
                (i18n/tru "Query must have either :source-table or :source-query, but not both."))}
   (fn [{:keys [source-table source-query]}]
     ;; actually, don't enforce the requirement that we have both for the time being, because in a `:pipeline` query
     ;; the `:source-query` part is implied if there is a previous stage.
     (and #_(or source-table source-query)
          (not (and source-table source-query))))])

(mr/def :mbql/join
  [:and
   [:map
    [:lib/type [:= :lib/join]]
    [:lib/options :lib/options]
    [:source-table {:optional true} ms/IntGreaterThanZero]
    [:source-query {:optional true} [:ref :mbql/inner-query]]
    [:condition :mbql/boolean-expression]]
   ::source-table-or-source-query])

(mr/def :mbql/inner-query
  [:and
   [:map
    [:lib/type [:= :lib/inner-query]]
    [:lib/options :lib/options]
    [:source-table {:optional true} ms/IntGreaterThanZero]
    [:source-query {:optional true} [:ref :mbql/inner-query]]
    [:order-by {:optional true} [:sequential :mbql/order-by]]
    [:joins {:optional true} [:sequential :mbql/join]]
    [:filter {:optional true} :mbql/boolean-expression]]
   ::source-table-or-source-query])

(mr/def :mbql/query-type
  [:enum :native :query])

(mr/def :mbql/outer-query
  [:and
   [:map
    [:lib/type [:= :lib/outer-query]]
    [:database ms/IntGreaterThanOrEqualToZero]
    [:type :mbql/query-type]]
   [:multi
    {:dispatch :type}
    [:query [:map
             [:query :mbql/inner-query]]]
    [:native [:map
              [:native [:map]]]]]])
