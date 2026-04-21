(ns metabase.lib.parameters.parse.types
  "Schemas and helper functions for various PARSED parameter maps. These are created from the `:parameters` passed in
  with a query."
  (:require
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

  *  A map containing the value and type info for the value, e.g.

     {:type   :date/single
      :value  #t \"2019-09-20T19:52:00.000-07:00\"}

  *  A vector of maps like the one above (for multiple values)"
  [:map
   [:lib/type [:= ::field-filter]]
   [:field    ::lib.schema.metadata/column]
   [:value    ::field-filter.value]])

(mu/defn field-filter :- ::field-filter
  "Create a parsed `field-filter` parameter from map `m`."
  [m]
  (assoc m :lib/type ::field-filter))

(defn field-filter?
  "Whether `x` is a map representing a parsed [[field-filter]] parameter."
  [x]
  (= (:lib/type x) ::field-filter))

(mr/def ::temporal-unit
  [:map
   [:lib/type [:= ::temporal-unit]]
   [:name     ::lib.schema.common/non-blank-string]
   ;; TODO (Cam 7/16/25) -- constrain `:value`
   [:value    some?]])

(mu/defn temporal-unit :- ::temporal-unit
  "Create a parsed `temporal-unit` parameter from map `m`."
  [m :- :map]
  (assoc m :lib/type ::temporal-unit))

(defn temporal-unit?
  "Whether `x` is a map representing a parsed [[temporal-unit]] parameter."
  [x]
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
  "Create a parsed `referenced-card-query` parameter from map `m`."
  [m :- :map]
  (assoc m :lib/type ::referenced-card-query))

(defn referenced-card-query?
  "Whether `x` is a map representing a parsed [[referenced-card-query]] parameter."
  [x]
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
  "Create a parsed `referenced-query-snippet` parameter from map `m`."
  [m :- :map]
  (assoc m :lib/type ::referenced-query-snippet))

(defn referenced-query-snippet?
  "Whether `x` is a map representing a parsed [[referenced-query-snippet]]."
  [x]
  (= (:lib/type x) ::referenced-query-snippet))

(mr/def ::date
  "As in a literal date, defined by date-string `s`."
  [:map
   [:lib/type [:= ::date]]
   [:s        ::lib.schema.literal/string.date]])

(mu/defn date :- ::date
  "Create a parsed `date` parameter from map `m`."
  [m :- :map]
  (assoc m :lib/type ::date))

(defn date?
  "Whether `x` is a map representing a parsed [[date]] parameter."
  [x]
  (= (:lib/type x) ::date))

(mr/def ::date-range
  [:map
   [:lib/type [:= ::date-range]]
   ;; TODO (Cam 7/16/25) -- constrain `:start` and `:end` values
   [:start    :any]
   [:end      :any]])

(mu/defn date-range :- ::date-range
  "Create a new parsed `date-range` parameter from map `m`."
  [m :- :map]
  (assoc m :lib/type ::date-range))

(defn date-range?
  "Whether `x` is a map representing a parsed [[date-range]] parameter."
  [x]
  (= (:lib/type x) ::date-range))

(mr/def ::date-time-range
  [:map
   [:lib/type [:= ::date-time-range]]
   ;; TODO (Cam 7/16/25) -- constrain `:start` and `:end` values
   [:start    :any]
   [:end      :any]])

(mu/defn date-time-range :- ::date-time-range
  "Create a new parsed `date-time-range` parameter from map `m`."
  [m :- :map]
  (assoc m :lib/type ::date-time-range))

(defn date-time-range?
  "Whether `x` is a map representing a parsed [[date-time-range]] parameter."
  [x]
  (= (:lib/type x) ::date-time-range))

(mr/def ::param
  [:map
   [:lib/type [:= ::param]]
   [:k        :string]])

(mu/defn param :- ::param
  "Create a new parsed `param` parameter from map `m`."
  [m :- :map]
  (assoc m :lib/type ::param))

(defn param?
  "Whether `x` is a map that represents a parsed [[param]] parameter."
  [x]
  (= (:lib/type x) ::param))

(mr/def ::function-param
  [:map
   [:lib/type      [:= ::function-param]]
   [:function-name :string]
   ;; TODO (Cam 7/16/25) -- constrain further; I think these have to be valid parameters
   [:args          [:sequential :any]]])

(mu/defn function-param :- ::function-param
  "Create a new parsed `function-param` from map `m`."
  [m :- :map]
  (assoc m :lib/type ::function-param))

(defn function-param?
  "Whether `x` is a map that represents a parsed [[function-param]]."
  [x]
  (= (:lib/type x) ::function-param))

(mr/def ::optional
  [:map
   [:lib/type [:= ::optional]]
   ;; TODO (Cam 7/16/25) -- constrain further
   [:args     [:sequential :any]]])

(mu/defn optional :- ::optional
  "Create a new parsed `optional` param from map `m`."
  [m :- :map]
  (assoc m :lib/type ::optional))

(defn optional?
  "Whether `x` is a map that represents a parsed [[optional]] parameter."
  [x]
  (= (:lib/type x) ::optional))
