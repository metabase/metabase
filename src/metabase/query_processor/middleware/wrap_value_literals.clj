(ns metabase.query-processor.middleware.wrap-value-literals
  "Middleware that wraps value literals in `value`/`absolute-datetime`/etc. clauses containing relevant type
  information; parses datetime string literals when appropriate."
  (:refer-clojure :exclude [select-keys])
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.error-type :as qp.error-type]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [select-keys]])
  (:import
   (java.time LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime)))

(mu/defn- value :- :mbql.clause/value
  [info :- :map v]
  [:value (assoc info :lib/uuid (str (random-uuid))) v])

(defn- type-info-from-col [col]
  (when col
    (merge
     (select-keys col [:coercion-strategy :semantic-type :database-type])
     (when-let [unit (lib/raw-temporal-bucket col)]
       {:unit unit}))))

(defn- ^:dynamic *type-info*
  "This is the type info for the LHS in something like

    [:= {} <lhs> <rhs>]

  usually a `:field` clause; we use this info to wrap `rhs` if it's a raw value e.g. `1`."
  [query path clause]
  (merge
   (when (lib.util/clause-of-type? clause :field)
     (type-info-from-col (lib.walk/apply-f-for-stage-at-path lib/metadata query path clause)))
   (let [expr-type (lib.walk/apply-f-for-stage-at-path lib/type-of query path clause)
         [_ {:keys [base-type]}] clause]
     {:base-type      (or base-type expr-type)
      :effective-type expr-type})))

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
  (value info nil))

(defmethod add-type-info Object
  [this info & _]
  (value info this))

(derive LocalDate      ::->absolute-datetime)
(derive LocalDateTime  ::->absolute-datetime)
(derive OffsetDateTime ::->absolute-datetime)
(derive ZonedDateTime ::->absolute-datetime)

(prefer-method add-type-info ::->absolute-datetime Object)

(defmethod add-type-info ::->absolute-datetime
  [this info & _]
  (lib/absolute-datetime this (get info :unit :default)))

(derive LocalTime  ::->time)
(derive OffsetTime ::->time)

(prefer-method add-type-info ::->time Object)

(defmethod add-type-info ::->time
  [this info & _]
  (lib/time this (get info :unit :default)))

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
    (lib/absolute-datetime t target-unit)))

(defmethod parse-temporal-string-literal :type/Date
  [_effective-type s target-unit]
  (let [t (parse-temporal-string-literal-to-class s LocalDate)]
    (lib/absolute-datetime t target-unit)))

(defmethod parse-temporal-string-literal :type/Time
  [_effective-type s target-unit]
  (let [t (parse-temporal-string-literal-to-class s LocalTime)]
    (lib/time t target-unit)))

(defmethod parse-temporal-string-literal :type/TimeWithTZ
  [_effective-type s target-unit]
  (let [t (parse-temporal-string-literal-to-class s OffsetTime)]
    (lib/time t target-unit)))

(defmethod parse-temporal-string-literal :type/DateTime
  [_effective-type s target-unit]
  (let [t (parse-temporal-string-literal-to-class s LocalDateTime)]
    (lib/absolute-datetime t target-unit)))

(defn- date-literal-string? [s]
  (not (str/includes? s "T")))

(defmethod parse-temporal-string-literal :type/DateTimeWithTZ
  [_effective-type s target-unit]
  (let [t (parse-temporal-string-literal-to-class s OffsetDateTime)
        target-unit (if (and (= target-unit :default)
                             (date-literal-string? s))
                      :day
                      target-unit)]
    (lib/absolute-datetime t target-unit)))

(defmethod parse-temporal-string-literal :type/DateTimeWithZoneID
  [_effective-type s target-unit]
  (let [target-unit (if (and (= target-unit :default)
                             (date-literal-string? s))
                      :day
                      target-unit)
        t           (parse-temporal-string-literal-to-class s ZonedDateTime)]
    (lib/absolute-datetime t target-unit)))

(defmethod add-type-info String
  [s {:keys [unit], :as info} & {:keys [parse-datetime-strings?]
                                 :or   {parse-datetime-strings? true}}]
  (if (and (or unit (when info (lib.types.isa/temporal? info)))
           parse-datetime-strings?
           (seq s))
    (let [effective-type ((some-fn :effective-type :base-type) info)]
      (parse-temporal-string-literal effective-type s (or unit :default)))
    (value info s)))

;;; -------------------------------------------- wrap-literals-in-clause ---------------------------------------------

(def ^:private raw-value? (complement lib.util/clause?))

(defn- wrap-value-literals-in-clause
  [query path clause]
  (lib.util.match/match-lite clause
    ;; two literals
    [(tag :guard #{:= :!= :< :> :<= :>=}) opts (x :guard raw-value?) (y :guard raw-value?)]
    (let [x-type (lib.schema.expression/type-of-resolved x)
          y-type (lib.schema.expression/type-of-resolved y)]
      [tag opts
       (add-type-info x {:base-type x-type :effective-type x-type})
       (add-type-info y {:base-type y-type :effective-type y-type})])

    ;; field and literal
    [(tag :guard #{:= :!= :< :> :<= :>=}) opts field (x :guard raw-value?)]
    [tag opts field (add-type-info x (*type-info* query path field))]

    ;; literal and field (literal on LHS)
    [(tag :guard #{:= :!= :< :> :<= :>=}) opts (x :guard raw-value?) field]
    [tag opts (add-type-info x (*type-info* query path field)) field]

    [:datetime-diff opts (x :guard string?) (y :guard string?) unit]
    [:datetime-diff opts (add-type-info (u.date/parse x) nil) (add-type-info (u.date/parse y) nil) unit]

    [(tag :guard #{:datetime-add :datetime-subtract :convert-timezone :temporal-extract}) opts (field :guard string?) & args]
    (into [tag opts (add-type-info (u.date/parse field) nil)] args)

    [:between opts field (min-val :guard raw-value?) (max-val :guard raw-value?)]
    [:between
     opts
     field
     (add-type-info min-val (*type-info* query path field))
     (add-type-info max-val (*type-info* query path field))]

    [(tag :guard #{:starts-with :ends-with :contains}) opts field (s :guard string?) & more]
    (let [s (add-type-info s (*type-info* query path field), :parse-datetime-strings? false)]
      (into [tag opts field s] more))

    ;; do not match inner clauses
    _ nil))

(mu/defn wrap-value-literals :- ::lib.schema/query
  "Middleware that wraps ran value literals in `:value` (for integers, strings, etc.) or `:absolute-datetime` (for
  datetime strings, etc.) clauses which include info about the Field they are being compared to. This is done mostly
  to make it easier for drivers to write implementations that rely on multimethod dispatch (by clause name) -- they
  can dispatch directly off of these clauses."
  [query :- ::lib.schema/query]
  (lib.walk/walk-clauses query (fn [query _path-type path clause]
                                 (wrap-value-literals-in-clause query path clause))))

;;;
;;; Tangentially-related nonsense not used by the middleware
;;;

;;; TODO (Cam 8/22/25) FIXME: This is used in exactly one place: the SQL QP... so why does it live in a QP middleware
;;; namespace? Nobody knows.
(defn unwrap-value-literal
  "Extract value literal from `:value` form or returns form as is if not a `:value` form."
  [maybe-value-form]
  (lib.util.match/match-one maybe-value-form
    [:value x & _] x
    _              &match))

(defn- type-info-no-query
  "This is like [[type-info*]] but specifically for supporting the legacy/deprecated [[wrap-value-literals-in-mbql]]
  function."
  {:deprecated "0.57.0"}
  [clause]
  (let [expr-type (lib.schema.expression/type-of-resolved clause)]
    (merge
     (when (and (lib.util/clause-of-type? clause :field)
                (qp.store/initialized?))
       (let [[_tag _opts id-or-name] clause]
         (when (pos-int? id-or-name)
           (type-info-from-col (lib.metadata/field (qp.store/metadata-provider) id-or-name)))))
     (when-let [unit (lib/raw-temporal-bucket clause)]
       {:unit unit})
     {:base-type      expr-type
      :effective-type expr-type})))

(mu/defn wrap-value-literals-in-mbql :- [:cat :keyword [:* :any]]
  "Given a normalized legacy MBQL query (important to desugar forms like `[:does-not-contain ...]` -> `[:not [:contains
  ...]]`), walks over the clause and annotates literals with type information.

  eg:

  [:not [:contains [:field 13 {:base_type :type/Text}] \"foo\"]]
  ->
  [:not [:contains [:field 13 {:base_type :type/Text}]
                   [:value {:base_type :type/Text, \"foo\"
                            :semantic_type nil,
                            :database_type \"VARCHAR\",
                            :name \"description\"}]]]

  DEPRECATED: This is for legacy compatibility and should not be used in new code."
  {:deprecated "0.57.0"}
  [mbql :- [:cat :keyword [:* :any]]]
  (-> mbql
      lib/->pMBQL
      (as-> $mbql (binding [*type-info* (fn [_query _path clause]
                                          #_{:clj-kondo/ignore [:deprecated-var]}
                                          (type-info-no-query clause))]
                    (-> (lib.walk/walk-clauses*
                         [$mbql]
                         (fn [clause]
                           (wrap-value-literals-in-clause nil nil clause)))
                        first)))
      lib/->legacy-MBQL))
