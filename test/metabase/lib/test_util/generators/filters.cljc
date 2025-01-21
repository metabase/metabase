(ns metabase.lib.test-util.generators.filters
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.lib.test-util.generators.util :as gen.u]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util.time :as u.time]))

;; Filter values =================================================================================
(defn- gen-int []
  (- (rand-int 2000000) 1000000))

(def ^:private valid-ascii
  (mapv char (range 0x20 0x7f)))

(def ^:private han-unicode
  (mapv char (range 0x4e00 0xa000)))

(defn- gen-string
  ([]
   (if (< (rand) 0.1)
     (gen-string han-unicode 40)
     (gen-string valid-ascii 70)))
  ([symbols max-len]
   (apply str (repeatedly (inc (rand-int max-len)) #(rand-nth symbols)))))

(defn- gen-time []
  (u.time/local-time (rand-int 24) (rand-int 60) (rand-int 60) (rand-int 1000000000)))

(defn- gen-time:minute []
  (u.time/local-time (rand-int 24) (rand-int 60) 0 0))

(defn- gen-date []
  ;; Random day of the year, from 2000-01-01 through 2037-12-31.
  ;; Avoids 2038 because of the 32-bit timestamp overflow.
  ;; TODO: Always adds 0-364 days, so it can't return Dec 31st of a leap year. I don't think it matters, but I will
  ;; highlight it.
  (u.time/add (u.time/local-date (+ 2000 (rand-int 38)) 1 1) ;; Jan 1, from 2000 through 2037
              :day
              (rand-int 365)))

(defn- gen-datetime []
  (u.time/local-date-time (gen-date) (gen-time)))

(defn- gen-datetime:minute []
  (u.time/local-date-time (gen-date) (gen-time:minute)))

(defn- gen-latitude []
  ;; +/- 75 degrees is a generous but plausible range for latitudes.
  (* 150 (- (rand) 0.5)))

(defn- gen-longitude []
  ;; +/- 180 degrees
  (- (* 360 (rand))
     180))

(def ^:private fake-categories
  (vec (for [i (range 1 41)]
         (str "Fake Category " i))))

(defn- gen-category []
  ;; Just some made-up values that are clearly not random strings for debugging.
  (rand-nth fake-categories))

(defn- rand-column-value [{:keys [effective-type] :as column}]
  (cond
    ;; Numeric PKs and FKs are always integers.
    (and (lib.types.isa/id? column)
         (lib.types.isa/numeric? column))              (abs (gen-int))
    (#{:type/BigInteger :type/Integer} effective-type) (gen-int)
    (lib.types.isa/category? column)                   (gen-category)
    (lib.types.isa/latitude? column)                   (gen-latitude)
    (lib.types.isa/longitude? column)                  (gen-longitude)
    (lib.types.isa/numeric? column)                    (cond-> (gen-int)
                                                         (< (rand) 0.5) (+ (rand)))
    (lib.types.isa/string-or-string-like? column)      (gen-string)
    (lib.types.isa/time? column)                       (gen-time)
    (lib.types.isa/date-without-time? column)          (gen-date)
    (lib.types.isa/date-or-datetime? column)           (gen-datetime)
    :else (throw (ex-info " !!! Not sure what values to generate for column" {:effective-type effective-type
                                                                              :column         column}))))

;; Filter clauses ================================================================================
(def ^:private ^:dynamic *filterable-columns* nil)

(defmulti ^:private gen-filter-clause
  {:arglists '([column operator])}
  (fn [_column operator]
    (:short operator)))

;; Binary operators like :<
(doseq [[op f] [[:<  lib/<]
                [:<= lib/<=]
                [:>  lib/>]
                [:>= lib/>=]]]
  (defmethod gen-filter-clause op [column _op]
    (f column (rand-column-value column))))

;; Multi-value operators like := and :starts-with
(doseq [[op f] [[:=                lib/=]
                [:!=               lib/!=]
                [:starts-with      lib/starts-with]
                [:ends-with        lib/ends-with]
                [:contains         lib/contains]
                [:does-not-contain lib/does-not-contain]]]
  (defmethod gen-filter-clause op [column _op]
    (apply f column (repeatedly (inc (rand-int 4))
                                #(rand-column-value column)))))

(defmethod gen-filter-clause :between [column _op]
  (let [lo (rand-column-value column)
        hi (rand-column-value column)]
    ;; TODO: Maybe make the LHS arg be the smaller? Right now they're random.
    ;; Probably they can be `sort`ed, but that might fail on weird types.
    (lib/between column lo hi)))

;; Unary operators like `:is-empty`.
(doseq [[op f] [[:is-empty  lib/is-empty]
                [:not-empty lib/not-empty]
                [:is-null   lib/is-null]
                [:not-null  lib/not-null]]]
  (defmethod gen-filter-clause op [column _op]
    (f column)))

(defn- skipped-operator? [op]
  (#{:inside} (:short op)))

(defn- units-from [min-unit]
  (drop-while #(not= % min-unit) lib.schema.temporal-bucketing/ordered-datetime-truncation-units))

(defn- gen-filter:unit
  "If the optional second argument is provided, returns a range unit that is at least as large as this minimum."
  ([column]
   (gen-filter:unit column (if (lib.types.isa/date-without-time? column)
                             :day
                             :minute)))
  ([_column min-unit]
   (gen.u/choose (units-from min-unit))))

(defn- gen-filter:relative-date-current [column]
  (lib/time-interval column :current (gen-filter:unit column)))

(defn- gen-filter:relative-date-nearby [column]
  (let [past-future (gen.u/choose [+ -])
        unit        (gen-filter:unit column)
        n           (gen.u/choose (range 1 20))]
    (cond-> (lib/time-interval column (past-future n) unit)
      (< (rand) 0.2) (lib.options/update-options assoc :include-current true))))

(defn- gen-filter:relative-date-offset [column]
  ;; Only one past-future, since both offsets have to point in the same direction, at least in the UI.
  (let [past-future (gen.u/choose [+ -])
        range-unit  (gen-filter:unit column)
        range-n     (gen.u/choose (range 1 20))
        offset-unit (gen-filter:unit column range-unit)
        offset-n    (gen.u/choose (range 1 6))]
    (lib/relative-time-interval column
                                (past-future range-n)  range-unit
                                (past-future offset-n) offset-unit)))

(defn- gen-filter:relative-date [column]
  ;; Current: day, week, month, quarter, year.
  ;; Previous: N minutes/hours/days/weeks/months/quarters/years
  ;; Next: N minutes/hours/days/weeks/months/quarters/years
  ;; Plus optionally either "include this <unit>" or "M <larger-unit>s from now/ago"
  (let [r (rand)]
    (cond
      (< r 0.2) (gen-filter:relative-date-current column)    ;; "This month"
      (< r 0.4) (gen-filter:relative-date-offset column)     ;; "Next 3 months starting from 2 years ago"
      :else     (gen-filter:relative-date-nearby column))))  ;; ""

(defmulti ^:private gen-filter:exclude-date-options
  {:arglists '([unit])}
  identity)

(defmethod gen-filter:exclude-date-options :hour-of-day [_unit]
  (range 0 24))

(defmethod gen-filter:exclude-date-options :day-of-week [_unit]
  (take 7 (iterate #(u.time/add % :day 1) (u.time/local-date))))

(defn- jan1 []
  (u.time/truncate (u.time/local-date) :year))

(defmethod gen-filter:exclude-date-options :month-of-year [_unit]
  (->> (jan1)
       (iterate #(u.time/add % :month 1))
       (take 12)))

(defmethod gen-filter:exclude-date-options :quarter-of-year [_unit]
  (->> (jan1)
       (iterate #(u.time/add % :month 3))
       (take 4)))

(defn- gen-filter:exclude-date [column]
  ;; Excludes are stored currently as:
  ;; [:!= {} [:field {:temporal-unit :month-of-year} 123] "2024-02-01" "2024-03-01"]
  ;; to exclude February and March.
  ;; The allowed units are: :day-of-week, :month-of-year, and :quarter-of-year; plus :hour-of-day for datetimes.
  ;; Hours are 0-based numbers, the others use exemplar dates - the first of a month, the nearest Thursday to today.
  (let [units    (cond-> [:day-of-week :month-of-year :quarter-of-year]
                   (not (lib.types.isa/date-without-time? column)) (conj :hour-of-day))
        unit     (gen.u/choose units)
        opts     (vec (gen-filter:exclude-date-options unit))
        ;; Always one option, plus 40% chance of more.
        selected (loop [sel #{(rand-nth opts)}]
                   (if (< (rand) 0.4)
                     (recur (conj sel (rand-nth opts)))
                     sel))
        ;; But if that selected everything, drop one at random.
        selected (cond-> selected
                   (= (count selected) (count opts)) (disj (rand-nth opts)))]
    (apply lib/!= (lib/with-temporal-bucket column unit) selected)))

(defn- specify-time? [column]
  (and (not (lib.types.isa/date-without-time? column))
       (< (rand) 0.2)))

(defn- gen-filter:date-binary [column operator]
  (if (specify-time? column)
    (operator (lib/with-temporal-bucket column :minute) (gen-datetime:minute))
    (operator column (gen-date))))

(defn- gen-filter:date-between [column]
  ;; TODO: Swap the arguments to put the earlier one on the left.
  (if (specify-time? column)
    (lib/between (lib/with-temporal-bucket column :minute)
                 (gen-datetime:minute) (gen-datetime:minute))
    (lib/between column (gen-date) (gen-date))))

(defn- gen-filter:date [column]
  ;; - 30% relative date ranges
  ;; - 20% exclude
  ;; - 50% before/after/on/between
  (let [r (rand)]
    (cond
      (< r 0.20) (gen-filter:relative-date column)
      (< r 0.30) (gen-filter:relative-date-offset column)
      (< r 0.50) (gen-filter:exclude-date column)
      (< r 0.60) (gen-filter:date-binary column lib/<)
      (< r 0.70) (gen-filter:date-binary column lib/>)
      (< r 0.85) (gen-filter:date-binary column lib/=)
      :else      (gen-filter:date-between column))))

(defn- gen-filter:datetime [column]
  ;; TODO: There's actually no difference right now. Clean this up?
  (gen-filter:date column))

(defn- gen-filter:generic [column]
  (when-let [operator (some->> (:operators column)
                               (remove skipped-operator?)
                               rand-nth)]
    (gen-filter-clause column operator)))

(defn- gen-filter:inside [col1 col2]
  (let [[lat lon] (if (lib.types.isa/latitude? col1)
                    [col1 col2]
                    [col2 col1])
        [lat-min lat-max] (sort (repeatedly 2 gen-latitude))
        [lon-min lon-max] (sort (repeatedly 2 gen-longitude))]
    ;; Yes, this is really the argument order for an `:inside` clause.
    (lib/inside lat lon lat-max lon-min lat-min lon-max)))

(defn- gen-filter:coordinate [column]
  (let [counterpart? (if (lib.types.isa/latitude? column)
                       lib.types.isa/longitude?
                       lib.types.isa/latitude?)
        counterparts (filter counterpart? *filterable-columns*)]
    (if (and (seq counterparts)
             (< (rand) 0.5))
      ;; If we found a coordinate pair, generate an :inside filter 50% of the time.
      (gen-filter:inside column (gen.u/choose counterparts))
      ;; Otherwise, generic filter on the original column.
      (gen-filter:generic column))))

(defn- ^:private gen-filter*
  ([] (gen-filter* 0))
  ([recursion-depth]
   (let [column (rand-nth *filterable-columns*)]
     (cond
       (lib.types.isa/coordinate? column)        (gen-filter:coordinate column)
       (lib.types.isa/date-without-time? column) (gen-filter:date column)
       (lib.types.isa/date-or-datetime? column)  (gen-filter:datetime column)
       :else
       (let [result (gen-filter:generic column)]
         ;; Sometimes we pick a column with no filter operators, and result is nil. Recur in that case to roll again.
         (if (= result ::no-operators)
           (if (>= recursion-depth 20)
             (throw (ex-info "Deep recusion in gen-filter* - no filterable columns, or none with valid :operators?"
                             {:filterable-columns *filterable-columns*}))
             (recur (inc recursion-depth)))
           result))))))

(doseq [[op f] [[:and lib/and]
                [:or  lib/or]]]
  (defmethod gen-filter-clause op [_column _op]
    (->> (repeatedly gen-filter*)
         (filter identity)
         (take (+ 2 (rand-int 3)))
         (apply f))))

(defn gen-filter
  "Given the [[lib/filterable-columns]] for our query and stage, returns a random filter for that stage.

  That includes `:and` and `:or` compound filters, numbers, strings, categories, datetimes, and coordinates.
  Coordinates include the specialized `:inside` expression. Datetimes generate relative, excluding, Before, After,
  Between and On filters, just like the FE."
  [filterable-columns]
  (binding [*filterable-columns* filterable-columns]
    (gen-filter*)))
