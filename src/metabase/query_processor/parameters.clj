(ns metabase.query-processor.parameters
  "Various record types below are used as a convenience for differentiating the different param types."
  (:require
   [clojure.string :as str]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.literal :as lib.schema.literal]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(def no-value
  "Convenience for representing an *optional* parameter present in a query but whose value is unspecified in the param
  values."
  ::no-value)

(mr/def ::no-value
  [:= ::no-value])

(mr/def ::field-filter.value.map
  [:map
   [:type ::lib.schema.parameter/type]
   [:value :any]])

(mr/def ::field-filter.value
  [:or
   ::no-value
   ::field-filter.value.map
   [:sequential [:ref ::field-filter.value]]])

(mr/def ::field-filter
  "'FieldFilter' is something that expands to a clause like 'some_field BETWEEN 1 AND 10'

  `field` is a `:metadata/column`

  `value` is either:

  * [[no-value]]

  *  A map contianing the value and type info for the value, e.g.

     {:type   :date/single
      :value  #t \"2019-09-20T19:52:00.000-07:00\"}

  *  A vector of maps like the one above (for multiple values)"
  [:map
   [:lib/type [:= ::field-filter]]
   [:field    ::lib.schema.metadata/column]
   [:value    ::field-filter.value]])

(mu/defn field-filter :- ::field-filter
  [m]
  (assoc m :lib/type ::field-filter))

(defn field-filter? [x]
  (= (:lib/type x) ::field-filter))

(mr/def ::temporal-unit
  [:map
   [:lib/type [:= ::temporal-unit]]
   [:name     ::lib.schema.common/non-blank-string]
   ;; TODO (Cam 7/16/25) -- constrain `:value`
   [:value    some?]])

(mu/defn temporal-unit :- ::temporal-unit
  [m :- :map]
  (assoc m :lib/type ::temporal-unit))

(defn temporal-unit? [x]
  (= (:lib/type x) ::temporal-unit))

(mr/def ::referenced-card-query
  "A ReferencedCardQuery parameter expands to the native query of the referenced card.

  `card-id` is the ID of the Card instance whose query is the value for this parameter.

  `query` is the native query as stored in the Card

  `parameters` are positional parameters for a parameterized native query e.g. the JDBC parameters corresponding to
  `?` placeholders"
  [:map
   [:lib/type   [:= ::referenced-card-query]]
   [:card-id    ::lib.schema.id/card]
   [:query      :string]
   [:parameters {:optional true} [:maybe [:sequential :any]]]])

(mu/defn referenced-card-query :- ::referenced-card-query
  [m :- :map]
  (assoc m :lib/type ::referenced-card-query))

(defn referenced-card-query? [x]
  (= (:lib/type x) ::referenced-card-query))

(mr/def ::referenced-query-snippet
  "A `ReferencedQuerySnippet` expands to the partial query snippet stored in the `NativeQuerySnippet` table in the
  application DB.

  `snippet-id` is the integer ID of the row in the application DB from where the snippet content is loaded.

  `content` is the raw query snippet which will be replaced, verbatim, for this template tag."
  [:map
   [:lib/type   [:= ::referenced-query-snippet]]
   [:snippet-id ::lib.schema.id/snippet]
   [:content    :string]])

(mu/defn referenced-query-snippet :- ::referenced-query-snippet
  [m :- :map]
  (assoc m :lib/type ::referenced-query-snippet))

(defn referenced-query-snippet? [x]
  (= (:lib/type x) ::referenced-query-snippet))

(mr/def ::date
  "As in a literal date, defined by date-string `s`."
  [:map
   [:lib/type [:= ::date]]
   [:s        ::lib.schema.literal/string.date]])

(mu/defn date :- ::date
  [m :- :map]
  (assoc m :lib/type ::date))

(mr/def ::date-range
  [:map
   [:lib/type [:= ::date-range]]
   ;; TODO (Cam 7/16/25) -- constrain `:start` and `:end` values
   [:start    :any]
   [:end      :any]])

(mr/def ::date-time-range
  [:map
   [:lib/type [:= ::date-time-range]]
   ;; TODO (Cam 7/16/25) -- constrain `:start` and `:end` values
   [:start    :any]
   [:end      :any]])

(mr/def ::param
  [:map
   [:lib/type [:= ::param]]
   [:k        :string]])

(mu/defn param :- ::param
  [param-name :- :string]
  {:lib/type ::param, :k (str/trim param-name)})

(defn param? [x]
  (= (:lib/type x) ::param))

(mr/def ::function-param
  [:map
   [:lib/type      [:= ::function-param]]
   [:function-name :string]
   ;; TODO (Cam 7/16/25) -- constrain further; I think these have to be valid parameters
   [:args          [:sequential :any]]])

(mu/defn function-param :- ::function-param
  [function-name :- :string
   args          :- [:sequential :any]]
  {:lib/type      ::function-param
   :function-name function-name
   :args          args})

(defn function-param? [x]
  (= (:lib/type x) ::function-param))

(mr/def ::optional
  [:map
   [:lib/type [:= ::optional]]
   ;; TODO (Cam 7/16/25) -- constrain further
   [:args     [:sequential :any]]])

(mu/defn optional :- ::optional
  [args :- [:sequential :any]]
  {:lib/type ::optional, :args args})

(defn optional? [x]
  (= (:lib/type x) ::optional))
