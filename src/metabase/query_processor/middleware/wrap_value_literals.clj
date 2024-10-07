(ns metabase.query-processor.middleware.wrap-value-literals
  "Middleware that wraps value literals in `value`/`absolute-datetime`/etc. clauses containing relevant type
  information; parses datetime string literals when appropriate."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.types :as types]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu])
  (:import
   (java.time LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime)))

;;; --------------------------------------------------- Type Info ----------------------------------------------------

(def ^:private ^:dynamic *inner-query*
  "To be bound in [[metabase.query-processor.middleware.wrap-value-literals/wrap-value-literals-in-mbql-query]].
  Original motivation is to provide metadata required for computation of _type info_. See the
  [[metabase.query-processor.middleware.wrap-value-literals/str-id-field->type-info]] docstring for details."
  nil)

(defmulti ^:private type-info
  "Get information about database, base, and semantic types for an object. This is passed to along to various
  `->honeysql` method implementations so drivers have the information they need to handle raw values like Strings,
  which may need to be parsed as a certain type."
  {:arglists '([field-clause])}
  mbql.u/dispatch-by-clause-name-or-class)

(defmethod type-info :default [_] nil)

(defmethod type-info :metadata/column
  [field]
  ;; Opts should probably override all of these
  (-> (select-keys field [:base-type :effective-type :coercion-strategy :semantic-type :database-type :name])
      (update-keys u/->snake_case_en)))

(defn- str-id-field->type-info
  "Return _type info_ for `_field` with string `field-name`, coming from the source query or joins."
  [[_tag field-name {:keys [join-alias] :as _opts} :as _field] inner-query]
  (when (string? field-name)
    ;; Use corresponding source-metadata from joins or `inner-query`.
    (let [source-metadatas (if join-alias
                             (some #(when (= join-alias (:alias %))
                                      (:source-metadata %))
                                   (:joins inner-query))
                             (:source-metadata inner-query))]
      (some #(when (= (:name %) field-name)
               (select-keys % [:base_type :effective_type :database_type]))
            source-metadatas))))

(defmethod type-info :field [[_ id-or-name opts :as field]]
  (merge
   ;; With Mlv2 queries, this could be combined with `:expression` below and use the column from the
   ;; query rather than metadata/field
   (if (integer? id-or-name)
     (type-info (lib.metadata/field (qp.store/metadata-provider) id-or-name))
     (str-id-field->type-info field *inner-query*))
   (when (:temporal-unit opts)
     {:unit (:temporal-unit opts)})
   (when (:base-type opts)
     {:base_type (:base-type opts)})
   (when (:effective-type opts)
     {:effective_type (:effective-type opts)})))

(defmethod type-info :expression [[_ _name opts]]
  (merge
   (when (:temporal-unit opts)
     {:unit (:temporal-unit opts)})
   (when (:base-type opts)
     {:base_type (:base-type opts)})
   (when (:effective-type opts)
     {:effective_type (:effective-type opts)})))

;;; ------------------------------------------------- add-type-info --------------------------------------------------

;; TODO -- parsing the temporal string literals should be moved into `auto-parse-filter-values`, it's really a
;; separate transformation from just wrapping the value
(defmulti ^:private add-type-info
  "Wraps value literals in `:value` clauses that includes base type info about the Field they're being compared against
  for easy driver QP implementation. Temporal literals (e.g., ISO-8601 strings) get wrapped in `:time` or
  `:absolute-datetime` instead which includes unit as well; temporal strings get parsed and converted to "
  {:arglists '([x info & {:keys [parse-datetime-strings?]}])}
  (fn [x & _] (class x)))

(defmethod add-type-info nil
  [_ info & _]
  [:value nil info])

(defmethod add-type-info Object
  [this info & _]
  [:value this info])

(defmethod add-type-info LocalDate
  [this info & _]
  [:absolute-datetime this (get info :unit :default)])

(defmethod add-type-info LocalDateTime
  [this info & _]
  [:absolute-datetime this (get info :unit :default)])

(defmethod add-type-info LocalTime
  [this info & _]
  [:time this (get info :unit :default)])

(defmethod add-type-info OffsetDateTime
  [this info & _]
  [:absolute-datetime this (get info :unit :default)])

(defmethod add-type-info OffsetTime
  [this info & _]
  [:time this (get info :unit :default)])

(defmethod add-type-info ZonedDateTime
  [this info & _]
  [:absolute-datetime this (get info :unit :default)])

(defmulti ^:private coerce-temporal
  "Coerce temporal value `t` to `target-class`, or throw an Exception if it is an invalid conversion."
  {:arglists '([t target-class])}
  (fn [t target-class]
    [(class t) target-class]))

(defn- throw-invalid-conversion [message]
  (throw (ex-info message {:type qp.error-type/invalid-query})))

(defn- throw-invalid-date []
  (throw-invalid-conversion (i18n/tru "Invalid date literal: expected a date, got a time")))

(defmethod coerce-temporal [java.time.LocalDate      java.time.LocalDate] [t _target-class]  t)
(defmethod coerce-temporal [java.time.LocalTime      java.time.LocalDate] [_t _target-class] (throw-invalid-date))
(defmethod coerce-temporal [java.time.OffsetTime     java.time.LocalDate] [_t _target-class] (throw-invalid-date))
(defmethod coerce-temporal [java.time.LocalDateTime  java.time.LocalDate] [t _target-class]  (t/local-date t))
(defmethod coerce-temporal [java.time.OffsetDateTime java.time.LocalDate] [t _target-class]  (t/local-date t))
(defmethod coerce-temporal [java.time.ZonedDateTime  java.time.LocalDate] [t _target-class]  (t/local-date t))

(defn- throw-invalid-time []
  (throw-invalid-conversion (i18n/tru "Invalid time literal: expected a time, got a date")))

(defn- LocalTime->OffsetTime [t]
  (if (= (qp.timezone/results-timezone-id) "UTC")
    (t/offset-time t (t/zone-offset 0))
    ;; if the zone is something else, we'll just have to make do with a LocalTime, since there's no way to determine
    ;; what the appropriate offset to use for something like `US/Pacific` is for a give TIME with no DATE associated
    ;; with it.
    t))

(defmethod coerce-temporal [LocalDate      LocalTime] [_t _target-class] (throw-invalid-time))
(defmethod coerce-temporal [LocalTime      LocalTime] [t _target-class]  t)
(defmethod coerce-temporal [OffsetTime     LocalTime] [t _target-class]  (t/local-time t))
(defmethod coerce-temporal [LocalDateTime  LocalTime] [t _target-class]  (t/local-time t))
(defmethod coerce-temporal [OffsetDateTime LocalTime] [t _target-class]  (t/local-time t))
(defmethod coerce-temporal [ZonedDateTime  LocalTime] [t _target-class]  (t/local-time t))

(defmethod coerce-temporal [LocalDate      OffsetTime] [_t _target-class] (throw-invalid-time))
(defmethod coerce-temporal [LocalTime      OffsetTime] [t _target-class]  (LocalTime->OffsetTime t))
(defmethod coerce-temporal [OffsetTime     OffsetTime] [t _target-class]  t)
(defmethod coerce-temporal [LocalDateTime  OffsetTime] [t target-class]   (coerce-temporal (t/local-time t) target-class))
(defmethod coerce-temporal [OffsetDateTime OffsetTime] [t _target-class]  (t/offset-time t))
(defmethod coerce-temporal [ZonedDateTime  OffsetTime] [t _target-class]  (t/offset-time t))

(defn- throw-invalid-datetime []
  (throw-invalid-conversion (i18n/tru "Invalid datetime literal: expected a date or datetime, got a time")))

(defmethod coerce-temporal [LocalDate      LocalDateTime] [t _target-class]  (t/local-date-time t (t/local-time 0)))
(defmethod coerce-temporal [LocalTime      LocalDateTime] [_t _target-class] (throw-invalid-datetime))
(defmethod coerce-temporal [OffsetTime     LocalDateTime] [_t _target-class] (throw-invalid-datetime))
(defmethod coerce-temporal [LocalDateTime  LocalDateTime] [t _target-class]  t)
(defmethod coerce-temporal [OffsetDateTime LocalDateTime] [t _target-class]  (t/local-date-time t))
(defmethod coerce-temporal [ZonedDateTime  LocalDateTime] [t _target-class]  (t/local-date-time t))

(defmethod coerce-temporal [LocalDate      OffsetDateTime] [t target-class]   (coerce-temporal (t/local-date-time t (t/local-time 0)) target-class))
(defmethod coerce-temporal [LocalTime      OffsetDateTime] [_t _target-class] (throw-invalid-datetime))
(defmethod coerce-temporal [OffsetTime     OffsetDateTime] [_t _target-class] (throw-invalid-datetime))
(defmethod coerce-temporal [LocalDateTime  OffsetDateTime] [t _target-class]  (t/offset-date-time t (qp.timezone/results-timezone-id)))
(defmethod coerce-temporal [OffsetDateTime OffsetDateTime] [t _target-class]  t)
(defmethod coerce-temporal [ZonedDateTime  OffsetDateTime] [t _target-class]  (t/offset-date-time t))

(defmethod coerce-temporal [LocalDate      ZonedDateTime] [t target-class]   (coerce-temporal (t/local-date-time t (t/local-time 0)) target-class))
(defmethod coerce-temporal [LocalTime      ZonedDateTime] [_t _target-class] (throw-invalid-datetime))
(defmethod coerce-temporal [OffsetTime     ZonedDateTime] [_t _target-class] (throw-invalid-datetime))
(defmethod coerce-temporal [LocalDateTime  ZonedDateTime] [t _target-class]  (t/zoned-date-time t (t/zone-id (qp.timezone/results-timezone-id))))
(defmethod coerce-temporal [OffsetDateTime ZonedDateTime] [t _target-class]  t) ; OffsetDateTime is perfectly fine.
(defmethod coerce-temporal [ZonedDateTime  ZonedDateTime] [t _target-class]  t)

(defn- parse-temporal-string-literal-to-class [s target-class]
  (coerce-temporal (u.date/parse s) target-class))

(defmulti ^:private parse-temporal-string-literal
  "Parse a temporal string literal like `2024-03-20` for use in a filter against a column with `effective-type`, e.g.
  `:type/Date`. The effective-type of the target column affects what we parse the string as; for example we'd parse
  the string above as a `LocalDate` for a `:type/Date` and a `OffsetDateTime` for a
  `:type/DateTimeWithTZ`."
  {:arglists '([effective-type s target-unit])}
  (fn [effective-type _s _target-unit]
    effective-type))

(defmethod parse-temporal-string-literal :default
  [_effective-type s target-unit]
  (let [t (u.date/parse s (qp.timezone/results-timezone-id))]
    [:absolute-datetime t target-unit]))

(defmethod parse-temporal-string-literal :type/Date
  [_effective-type s target-unit]
  (let [t (parse-temporal-string-literal-to-class s LocalDate)]
    [:absolute-datetime t target-unit]))

(defmethod parse-temporal-string-literal :type/Time
  [_effective-type s target-unit]
  (let [t (parse-temporal-string-literal-to-class s LocalTime)]
    [:time t target-unit]))

(defmethod parse-temporal-string-literal :type/TimeWithTZ
  [_effective-type s target-unit]
  (let [t (parse-temporal-string-literal-to-class s OffsetTime)]
    [:time t target-unit]))

(defmethod parse-temporal-string-literal :type/DateTime
  [_effective-type s target-unit]
  (let [t (parse-temporal-string-literal-to-class s LocalDateTime)]
    [:absolute-datetime t target-unit]))

(defn- date-literal-string? [s]
  (not (str/includes? s "T")))

(defmethod parse-temporal-string-literal :type/DateTimeWithTZ
  [_effective-type s target-unit]
  (let [t (parse-temporal-string-literal-to-class s OffsetDateTime)
        target-unit (if (and (= target-unit :default)
                             (date-literal-string? s))
                      :day
                      target-unit)]
    [:absolute-datetime t target-unit]))

(defmethod parse-temporal-string-literal :type/DateTimeWithZoneID
  [_effective-type s target-unit]
  (let [target-unit (if (and (= target-unit :default)
                             (date-literal-string? s))
                      :day
                      target-unit)
        t           (parse-temporal-string-literal-to-class s ZonedDateTime)]
    [:absolute-datetime t target-unit]))

(defmethod add-type-info String
  [s {:keys [unit], :as info} & {:keys [parse-datetime-strings?]
                                 :or   {parse-datetime-strings? true}}]
  (if (and (or unit (when info (types/temporal-field? info)))
           parse-datetime-strings?
           (seq s))
    (let [effective-type ((some-fn :effective_type :base_type) info)]
      (parse-temporal-string-literal effective-type s (or unit :default)))
    [:value s info]))

;;; -------------------------------------------- wrap-literals-in-clause ---------------------------------------------

(def ^:private raw-value? (complement mbql.u/mbql-clause?))

(defn wrap-value-literals-in-mbql
  "Given a normalized mbql query (important to desugar forms like `[:does-not-contain ...]` -> `[:not [:contains
  ...]]`), walks over the clause and annotates literals with type information.

  eg:

  [:not [:contains [:field 13 {:base_type :type/Text}] \"foo\"]]
  ->
  [:not [:contains [:field 13 {:base_type :type/Text}]
                   [:value \"foo\" {:base_type :type/Text,
                                    :semantic_type nil,
                                    :database_type \"VARCHAR\",
                                    :name \"description\"}]]]"
  [mbql]
  (lib.util.match/replace mbql
    [(clause :guard #{:= :!= :< :> :<= :>=}) field (x :guard raw-value?)]
    [clause field (add-type-info x (type-info field))]

    [:datetime-diff (x :guard string?) (y :guard string?) unit]
    [:datetime-diff (add-type-info (u.date/parse x) nil) (add-type-info (u.date/parse y) nil) unit]

    [(clause :guard #{:datetime-add :datetime-subtract :convert-timezone :temporal-extract}) (field :guard string?) & args]
    (into [clause (add-type-info (u.date/parse field) nil)] args)

    [:between field (min-val :guard raw-value?) (max-val :guard raw-value?)]
    [:between
     field
     (add-type-info min-val (type-info field))
     (add-type-info max-val (type-info field))]

    [(clause :guard #{:starts-with :ends-with :contains}) field (s :guard string?) & more]
    (let [s (add-type-info s (type-info field), :parse-datetime-strings? false)]
      (into [clause field s] more))))

(defn unwrap-value-literal
  "Extract value literal from `:value` form or returns form as is if not a `:value` form."
  [maybe-value-form]
  (lib.util.match/match-one maybe-value-form
    [:value x & _] x
    _              &match))

(defn ^:private wrap-value-literals-in-mbql-query
  [{:keys [source-query], :as inner-query} options]
  (let [inner-query (cond-> inner-query
                      source-query (update :source-query wrap-value-literals-in-mbql-query options))]
    (binding [*inner-query* inner-query]
      (wrap-value-literals-in-mbql inner-query))))

(mu/defn wrap-value-literals :- mbql.s/Query
  "Middleware that wraps ran value literals in `:value` (for integers, strings, etc.) or `:absolute-datetime` (for
  datetime strings, etc.) clauses which include info about the Field they are being compared to. This is done mostly
  to make it easier for drivers to write implementations that rely on multimethod dispatch (by clause name) -- they
  can dispatch directly off of these clauses."
  [{query-type :type, :as query}]
  (if-not (= query-type :query)
    query
    (update query :query wrap-value-literals-in-mbql-query nil)))
