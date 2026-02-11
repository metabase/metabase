(ns metabase.lib.filter.desugar
  (:refer-clojure :exclude [some mapv])
  (:require
   #?@(:clj ([metabase.lib.filter.desugar.jvm :as lib.filter.desugar.jvm]
             [metabase.util.i18n :as i18n])
       :cljs ([metabase.util.log :as log]))
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.filter.simplify-compound :as lib.filter.simplify-compound]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.mbql-clause :as lib.schema.mbql-clause]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [some mapv]]
   [metabase.util.time :as u.time]))

(mr/def ::clause
  [:and
   [:ref ::lib.schema.mbql-clause/clause] ; TODO -- should we use `:metabase.lib.schema.expression/boolean` here?
   [:ref ::lib.schema.util/unique-uuids]])

(defn- merge-options [clause opts]
  (lib.options/update-options clause merge opts))

(mu/defn- desugar-inside :- ::clause
  "Rewrite `:inside` filter clauses as a pair of `:between` clauses."
  [expr :- ::clause]
  (lib.util.match/replace expr
    [:inside opts lat-field lon-field lat-max lon-min lat-min lon-max]
    (-> (lib.filter/and
         (lib.filter/between lat-field lat-min lat-max)
         (lib.filter/between lon-field lon-min lon-max))
        (merge-options opts))))

(mu/defn- desugar-is-null-and-not-null :- ::clause
  "Rewrite `:is-null` and `:not-null` filter clauses as simpler `:=` and `:!=`, respectively."
  [expr :- ::clause]
  (lib.util.match/replace expr
    [:is-null  opts x] [:=  opts x nil]
    [:not-null opts x] [:!= opts x nil]))

(defn- emptyable?
  [expr]
  (isa? (lib.schema.expression/type-of-resolved expr) ::lib.schema.expression/emptyable))

(mu/defn- desugar-is-empty-and-not-empty :- ::clause
  "Rewrite `:is-empty` and `:not-empty` filter clauses as simpler `:=` and `:!=`, respectively.

   If `:not-empty` is called on `::lib.schema.expression/emptyable` type, expand check for empty string. For
   non-`emptyable` types act as `:is-null`. If field has nil base type it is considered not emptyable expansion wise."
  [expr :- ::clause]
  (lib.util.match/replace expr
    [:is-empty opts arg]
    (-> (if (emptyable? arg)
          (lib.filter/or
           (lib.filter/= (lib.util/fresh-uuids arg) nil)
           (lib.filter/= (lib.util/fresh-uuids arg) ""))
          (lib.filter/= arg nil))
        (merge-options opts))

    [:not-empty opts arg]
    (-> (if (emptyable? arg)
          (lib.filter/and
           (lib.filter/!= (lib.util/fresh-uuids arg) nil)
           (lib.filter/!= (lib.util/fresh-uuids arg) ""))
          (lib.filter/!= (lib.util/fresh-uuids arg) nil))
        (merge-options opts))))

(mu/defn- update-temporal-unit-in-refs :- ::clause
  "Replace a field or expression inside :time-interval"
  [expr :- ::clause
   unit :- ::lib.schema.temporal-bucketing/unit]
  (lib.util.match/replace expr
    #{:field :expression}
    (lib.options/update-options &match assoc :temporal-unit unit)))

(mu/defn- desugar-time-interval :- ::clause
  "Rewrite `:time-interval` filter clauses as simpler ones like `:=` or `:between`."
  [expr :- ::clause]
  (lib.util.match/replace expr
    ;; replace current/last/next with corresponding value of n and recur
    [:time-interval opts field-or-expression :current unit] (recur [:time-interval opts field-or-expression  0 unit])
    [:time-interval opts field-or-expression :last    unit] (recur [:time-interval opts field-or-expression -1 unit])
    [:time-interval opts field-or-expression :next    unit] (recur [:time-interval opts field-or-expression  1 unit])

    [:time-interval (opts :guard :include-current) field-or-expression (n :guard neg?) unit]
    (-> (lib.filter/between
         (update-temporal-unit-in-refs field-or-expression unit)
         (lib.expression/relative-datetime n unit)
         (lib.expression/relative-datetime 0 unit))
        (merge-options opts))

    [:time-interval (opts :guard :include-current) field-or-expression n unit]
    (-> (lib.filter/between
         (update-temporal-unit-in-refs field-or-expression unit)
         (lib.expression/relative-datetime 0 unit)
         (lib.expression/relative-datetime n unit))
        (merge-options opts))

    [:time-interval opts field-or-expression (n :guard #{-1 0 1}) unit]
    (-> (lib.filter/= (update-temporal-unit-in-refs field-or-expression unit)
                      (lib.expression/relative-datetime n unit))
        (merge-options opts))

    [:time-interval opts field-or-expression (n :guard neg?) unit]
    (-> (lib.filter/between
         (update-temporal-unit-in-refs field-or-expression unit)
         (lib.expression/relative-datetime n unit)
         (lib.expression/relative-datetime -1 unit))
        (merge-options opts))

    [:time-interval opts field-or-expression n unit]
    (-> (update-temporal-unit-in-refs field-or-expression unit)
        (lib.filter/between
         (lib.expression/relative-datetime 1 unit)
         (lib.expression/relative-datetime n unit))
        (merge-options opts))))

(defn- with-default-temporal-bucket-in-refs [arg]
  (lib.util/fresh-uuids (update-temporal-unit-in-refs arg :default)))

(mu/defn- desugar-relative-time-interval :- ::clause
  "Transform `:relative-time-interval` to `:and` expression."
  [expr :- ::clause]
  (lib.util.match/replace expr
    [:relative-time-interval opts arg (value :guard int?) bucket offset-value offset-bucket]
    (let [bucket            #(lib.util/fresh-uuids bucket)
          offset-value      #(lib.util/fresh-uuids offset-value)
          offset-bucket     #(lib.util/fresh-uuids offset-bucket)
          offset            #(lib.expression/interval (offset-value) (offset-bucket))
          lower-bound       (if (neg? value)
                              (lib.expression/relative-datetime value (bucket))
                              (lib.expression/relative-datetime 1 (bucket)))
          upper-bound       (if (neg? value)
                              (lib.expression/relative-datetime 0 (bucket))
                              (lib.expression/relative-datetime (inc value) (bucket)))
          lower-with-offset (lib.expression/+ lower-bound (offset))
          upper-with-offset (lib.expression/+ upper-bound (offset))]
      (-> (lib.filter/and
           (lib.filter/>= (with-default-temporal-bucket-in-refs arg) lower-with-offset)
           (lib.filter/< (with-default-temporal-bucket-in-refs arg) upper-with-offset))
          (merge-options opts)))))

(mu/defn- desugar-during :- ::clause
  "Transform a `:during` expression to an `:and` expression."
  [expr :- ::clause]
  (lib.util.match/replace expr
    [:during opts arg value unit]
    (let [lower-bound (u.time/truncate value unit)
          upper-bound (u.time/add lower-bound unit 1)]
      (-> (lib.filter/and
           (lib.filter/>= (with-default-temporal-bucket-in-refs arg) lower-bound)
           (lib.filter/<  (with-default-temporal-bucket-in-refs arg) upper-bound))
          (merge-options opts)))))

(mu/defn- desugar-if :- ::clause
  "Transform a `:if` expression to an `:case` expression."
  [expr :- ::clause]
  (letfn [(process-fragment [fragment]
            (cond
              (lib.util/clause? fragment) (desugar-if fragment)
              (vector? fragment) (mapv process-fragment fragment)
              :else fragment))]
    (lib.util.match/replace expr
      [:if opts & args]
      (-> (map process-fragment args)
          (->> (apply lib.expression/case))
          (merge-options opts)))))

(mu/defn- desugar-in :- ::clause
  "Transform `:in` and `:not-in` expressions to `:=` and `:!=` expressions."
  [expr :- ::clause]
  (lib.util.match/replace expr
    [:in opts & args]
    (-> (apply lib.filter/= args)
        (merge-options opts))

    [:not-in opts & args]
    (-> (apply lib.filter/!= args)
        (merge-options opts))))

(mu/defn- desugar-does-not-contain :- ::clause
  "Rewrite `:does-not-contain` filter clauses as simpler `[:not [:contains ...]]` clauses.

  Note that [[desugar-multi-argument-comparisons]] will have already desugared any 3+ argument `:does-not-contain` to
  several `[:and [:does-not-contain ...] [:does-not-contain ...] ...]` clauses, which then get rewritten here into
  `[:and [:not [:contains ...]] [:not [:contains ...]]]`."
  [expr :- ::clause]
  (lib.util.match/replace expr
    [:does-not-contain opts whole & parts]
    (-> (lib.filter/not (-> (apply lib.filter/contains whole parts)
                            ;; need to preserve stuff like `:case-sensitive`. Prefer values in each clause over `opts`
                            ;; so we don't get duplicate UUIDs
                            (lib.options/update-options #(merge opts %))))
        (merge-options opts))))

(mu/defn- desugar-multi-argument-comparisons :- ::clause
  "`:=`, `!=`, `:contains`, `:does-not-contain`, `:starts-with` and `:ends-with` clauses with more than 2 args
  automatically get rewritten as compound filters.

     [:= field x y]                -> [:or  [:=  field x] [:=  field y]]
     [:!= field x y]               -> [:and [:!= field x] [:!= field y]]
     [:does-not-contain field x y] -> [:and [:does-not-contain field x] [:does-not-contain field y]]

  Note that the optional options map is in different positions for `:contains`, `:does-not-contain`, `:starts-with` and
  `:ends-with` depending on the number of arguments. 2-argument forms use the legacy style `[:contains field x opts]`.
  Multi-argument forms use pMBQL style with the options at index 1, **even if there are no options**:
  `[:contains {} field x y z]`."
  [expr :- ::clause]
  (lib.util.match/replace expr
    [:= opts field a b & more]
    (-> (apply lib.filter/or (map (fn [expr]
                                    (lib.filter/= (lib.util/fresh-uuids field) expr))
                                  (list* a b more)))
        (merge-options opts))

    [:!= opts field a b & more]
    (-> (apply lib.filter/and (map (fn [expr]
                                     (lib.filter/!= (lib.util/fresh-uuids field) expr))
                                   (list* a b more)))
        (merge-options opts))

    [(op :guard #{:contains :does-not-contain :starts-with :ends-with})
     (opts :guard map?)
     field a b & more]
    (let [f (case op
              :contains         lib.filter/contains
              :does-not-contain lib.filter/does-not-contain
              :starts-with      lib.filter/starts-with
              :ends-with        lib.filter/ends-with)]
      (-> (apply (if (= op :does-not-contain) lib.filter/and lib.filter/or)
                 (map (fn [expr]
                        (-> (f (lib.util/fresh-uuids field) expr)
                            (lib.options/update-options #(merge opts %))))
                      (list* a b more)))
          (merge-options opts)))))

(mu/defn- desugar-current-relative-datetime :- ::clause
  "Replace `relative-datetime` clauses like `[:relative-datetime :current]` with `[:relative-datetime 0 <unit>]`.
  `<unit>` is inferred from the `:field` the clause is being compared to (if any), otherwise falls back to `default.`"
  [expr :- ::clause]
  (lib.util.match/replace expr
    [tag opts field & (args :guard (fn [args]
                                     (some (fn [arg]
                                             (lib.util.match/match-one arg [:relative-datetime _opts :current]))
                                           args)))]
    (let [temporal-unit (or (lib.util.match/match-lite field
                              [:field {:temporal-unit temporal-unit} _]
                              temporal-unit)
                            :default)]
      (into [tag opts field]
            (map (fn [arg]
                   (lib.util.match/replace arg
                     [:relative-datetime relative-datetime-opts :current]
                     (-> (lib.expression/relative-datetime 0 temporal-unit)
                         (merge-options relative-datetime-opts)))))
            args))))

(def ^:private temporal-extract-ops->unit
  "Mapping from the sugar syntax to extract datetime to the unit."
  {[:get-year        nil]       :year-of-era
   [:get-quarter     nil]       :quarter-of-year
   [:get-month       nil]       :month-of-year
   ;; default get-week mode is iso
   [:get-week        nil]       :week-of-year-iso
   [:get-week        :iso]      :week-of-year-iso
   [:get-week        :us]       :week-of-year-us
   [:get-week        :instance] :week-of-year-instance
   [:get-day         nil]       :day-of-month
   [:get-day-of-week nil]       :day-of-week
   [:get-day-of-week :iso]      :day-of-week-iso
   [:get-hour        nil]       :hour-of-day
   [:get-minute      nil]       :minute-of-hour
   [:get-second      nil]       :second-of-minute})

(def ^:private temporal-extract-ops
  (->> (keys temporal-extract-ops->unit)
       (map first)
       set))

(mu/defn- desugar-temporal-extract :- ::clause
  "Replace datetime extractions clauses like `[:get-year field]` with `[:temporal-extract field :year]`."
  [expr :- ::clause]
  (lib.util.match/replace expr
    [(tag :guard temporal-extract-ops) opts field & args]
    [:temporal-extract opts field (temporal-extract-ops->unit [tag (first args)])]))

(mu/defn- desugar-divide-with-extra-args :- ::clause
  [expression :- ::clause]
  (lib.util.match/replace expression
    [:/ opts x y z & more]
    (recur (-> (apply lib.expression// (lib.expression// x y) z more)
               (merge-options opts)))))

(mu/defn- temporal-case-expression :- :mbql.clause/case
  "Creates a `:case` expression with a condition for each value of the given unit."
  [expr :- ::clause
   opts :- :map
   unit :- :keyword
   n    :- :int]
  (let [user-locale #?(:clj  (i18n/user-locale)
                       :cljs nil)]
    (-> (lib.expression/case
         (mapv (fn [raw-value]
                 [(lib.filter/= (lib.util/fresh-uuids expr) raw-value)
                  (u.time/format-unit raw-value unit user-locale)])
               (range 1 (inc n))))
        (lib.options/update-options merge opts {:default ""}))))

(mu/defn- desugar-temporal-names :- ::clause
  "Given an expression like `[:month-name column]`, transforms this into a `:case` expression, which matches the input
  numbers and transforms them into names.

  Uses the user's locale rather than the site locale, so the results will depend on the runner of the query, not just
  the query itself. Filtering should be done based on the number, rather than the name."
  [expression :- ::clause]
  (lib.util.match/replace expression
    [:month-name   opts expr] (recur (temporal-case-expression expr opts :month-of-year   12))
    [:quarter-name opts expr] (recur (temporal-case-expression expr opts :quarter-of-year  4))
    [:day-name     opts expr] (recur (temporal-case-expression expr opts :day-of-week      7))))

(mu/defn- desugar-expression :- ::clause
  "Rewrite various 'syntactic sugar' expressions like `:/` with more than two args into something simpler for drivers
  to compile."
  [expression :- ::clause]
  ;; The `mbql.jvm-u/desugar-host-and-domain` is implemented only for jvm because regexes are not compatible with
  ;; Safari.
  (let [desugar-host-and-domain* #?(:clj  lib.filter.desugar.jvm/desugar-host-and-domain
                                    :cljs (fn [x]
                                            (log/warn "`desugar-host-and-domain` implemented only on JVM.")
                                            x))]
    (-> expression
        desugar-divide-with-extra-args
        desugar-host-and-domain*
        desugar-temporal-names)))

(mu/defn- maybe-desugar-expression :- ::clause
  [clause :- ::clause]
  (cond-> clause
    (or (lib.util/clause-of-type? clause :field)
        (mr/validate ::lib.schema.expression/expression clause))
    desugar-expression))

(mu/defn desugar-filter-clause :- ::clause
  "Rewrite various 'syntatic sugar' filter clauses like `:time-interval` and `:inside` as simpler, logically
  equivalent clauses. This can be used to simplify the number of filter clauses that need to be supported by anything
  that needs to enumerate all the possible filter types."
  [filter-clause :- ::clause]
  (-> filter-clause
      desugar-current-relative-datetime
      desugar-in
      desugar-multi-argument-comparisons
      desugar-does-not-contain
      desugar-time-interval
      desugar-relative-time-interval
      desugar-is-null-and-not-null
      desugar-is-empty-and-not-empty
      desugar-inside
      lib.filter.simplify-compound/simplify-compound-filter
      desugar-temporal-extract
      desugar-during
      desugar-if
      maybe-desugar-expression))
