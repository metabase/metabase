(ns metabase.lib.schema.expression.temporal
  (:require
   [clojure.set :as set]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.literal :as literal]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.lib.schema.temporal-bucketing :as temporal-bucketing]
   [metabase.shared.util.internal.time-common :as shared.ut.common]
   [metabase.util.malli.registry :as mr])
  #?@
  (:clj
   [(:import
     (java.time ZoneId))]
   :cljs
   [(:require
     ["moment" :as moment]
     ["moment-timezone" :as mtz])]))

#?(:cljs
   ;; so the moment-timezone stuff gets loaded
   (comment mtz/keep-me))

(mbql-clause/define-tuple-mbql-clause :interval :- :type/Interval
  :int
  ::temporal-bucketing/unit.date-time.interval)

(defmethod expression/type-of-method :lib.type-of/type-is-temporal-type-of-first-arg [[_tag _opts temporal]]
  ;; For datetime-add, datetime-subtract, etc. the first arg is a temporal value. However, some valid values are
  ;; formatted strings for which type-of returns eg. #{:type/String :type/DateTime}. Since we're doing date arithmetic,
  ;; we know for sure it's the temporal type.
  (let [inner-type (expression/type-of temporal)]
    (if (set? inner-type)
      (let [temporal-set (set/intersection inner-type #{:type/Date :type/DateTime})]
        (if (= (count temporal-set) 1)
          (first temporal-set)
          temporal-set))
      inner-type)))

;; For most purposes, `:lib.type-of/type-is-temporal-type-of-first-arg` is the same as
;; `:lib.type-of/type-is-type-of-first-arg`. In particular, for the unambiguous `lib.metadata.calculation/type-of`, they
;; are identical. They only differ when there's a set of possibilities in `lib.schema.expression/type-of`.
(lib.hierarchy/derive :lib.type-of/type-is-temporal-type-of-first-arg :lib.type-of/type-is-type-of-first-arg)

;;; TODO -- we should constrain this so that you can only use a Date unit if expr is a date, etc.
(doseq [op [:datetime-add :datetime-subtract]]
  (mbql-clause/define-tuple-mbql-clause op
    #_expr   [:ref ::expression/temporal]
    #_amount :int
    #_unit   [:ref ::temporal-bucketing/unit.date-time.interval])
  (lib.hierarchy/derive op :lib.type-of/type-is-temporal-type-of-first-arg))

(doseq [op [:get-year :get-month :get-day :get-hour :get-minute :get-second :get-quarter]]
  (mbql-clause/define-tuple-mbql-clause op :- :type/Integer
    [:schema [:ref ::expression/temporal]]))

(mbql-clause/define-tuple-mbql-clause :datetime-diff :- :type/Integer
  #_:datetime1 [:schema [:ref ::expression/temporal]]
  #_:datetime2 [:schema [:ref ::expression/temporal]]
  #_:unit [:ref ::temporal-bucketing/unit.date-time.truncate])

(doseq [temporal-extract-op #{:get-second :get-minute :get-hour
                              :get-day :get-day-of-week
                              :get-month :get-quarter :get-year}]
  (mbql-clause/define-tuple-mbql-clause temporal-extract-op :- :type/Integer
    #_:datetime [:schema [:ref ::expression/temporal]]))

(mr/def ::week-mode
  [:enum {:decode/normalize common/normalize-keyword} :iso :us :instance])

(mbql-clause/define-catn-mbql-clause :get-week :- :type/Integer
  [:datetime [:schema [:ref ::expression/temporal]]]
  ;; TODO : the mode should probably go in the options map in modern MBQL rather than have it be a separate positional
  ;; argument. But we can't refactor everything in one go, so that will have to be a future refactor.
  [:mode     [:? [:schema [:ref ::week-mode]]]])

(mr/def ::timezone-id
  [:and
   ::common/non-blank-string
   [:or
    (into [:enum
           {:error/message "valid timezone ID"
            :error/fn      (fn [{:keys [value]} _]
                             (str "invalid timezone ID: " (pr-str value)))}]
          (sort
           #?( ;; 600 timezones on java 17
              :clj (ZoneId/getAvailableZoneIds)
              ;; 596 timezones on moment-timezone 0.5.38
              :cljs (.names (.-tz moment)))))
    ::literal/string.zone-offset]])

(mbql-clause/define-catn-mbql-clause :convert-timezone
  [:datetime [:schema [:ref ::expression/temporal]]]
  [:target   [:schema [:ref ::timezone-id]]]
  [:source   [:? [:schema [:ref ::timezone-id]]]])

(lib.hierarchy/derive :convert-timezone :lib.type-of/type-is-temporal-type-of-first-arg)

(mbql-clause/define-tuple-mbql-clause :now :- :type/DateTimeWithTZ)

;;; if `:absolute-datetime` has `:base-type` in options, it must either derive from `:type/Date` or `:type/DateTime`.
;;; TODO -- we should do additional validation here and make sure the unit/value agree with base-type when it's
;;; present.
(mr/def ::absolute-datetime.base-type
  [:and
   [:ref ::common/base-type]
   [:fn
    {:error/message ":absolute-datetime base-type must derive from :type/Date or :type/DateTime"}
    (fn [base-type]
      (some #(isa? base-type %)
            [:type/Date
             :type/DateTime]))]])

(mr/def ::absolute-datetime.options
  [:merge
   [:ref ::common/options]
   [:map
    [:base-type {:optional true} [:ref ::absolute-datetime.base-type]]]])

(mbql-clause/define-mbql-clause :absolute-datetime
  [:cat
   {:error/message "valid :absolute-datetime clause"}
   [:= {:decode/normalize common/normalize-keyword} :absolute-datetime]
   [:schema [:ref ::absolute-datetime.options]]
   [:alt
    [:cat
     {:error/message ":absolute-datetime literal and unit for :type/Date"}
     [:schema [:or
               [:ref ::literal/date]
               ;; absolute datetime also allows `year-month` and `year` literals.
               [:ref ::literal/string.year-month]
               [:ref ::literal/string.year]]]
     [:schema [:or
               [:= {:decode/normalize common/normalize-keyword} :default]
               [:ref ::temporal-bucketing/unit.date]]]]
    [:cat
     {:error/message ":absolute-datetime literal and unit for :type/DateTime"}
     [:schema [:or
               [:= {:decode/normalize common/normalize-keyword} :current]
               [:ref ::literal/datetime]]]
     [:schema [:or
               [:= {:decode/normalize common/normalize-keyword} :default]
               [:ref ::temporal-bucketing/unit.date-time]]]]]])

(defmethod expression/type-of-method :absolute-datetime
  [[_tag _opts value unit]]
  (or
   ;; if value is `:current`, then infer the type based on the unit. Date unit = `:type/Date`. Anything else =
   ;; `:type/DateTime`.
   (when (= value :current)
     (cond
       (= unit :default)                                 :type/DateTime
       (mr/validate ::temporal-bucketing/unit.date unit) :type/Date
       :else                                             :type/DateTime))
   ;; handle year-month and year string regexes, which are not allowed as date literals unless wrapped in
   ;; `:absolute-datetime`.
   (when (string? value)
     (cond
       (re-matches shared.ut.common/year-month-regex value) :type/Date
       (re-matches shared.ut.common/year-regex value)       :type/Date))
   ;; for things that return a union of types like string literals, only the temporal types make sense, so filter out
   ;; everything else.
   (let [value-type (expression/type-of value)
         value-type (if (set? value-type)
                      (into #{} (filter #(isa? % :type/Temporal)) value-type)
                      value-type)]
     (if (and (set? value-type)
              (= (count value-type) 1))
       (first value-type)
       value-type))))

(mr/def ::relative-datetime.amount
  [:multi {:dispatch (some-fn keyword? string?)}
   [true  [:= {:decode/normalize common/normalize-keyword} :current]]
   [false :int]])

(mbql-clause/define-catn-mbql-clause :relative-datetime :- :type/DateTime
  [:n    [:schema [:ref ::relative-datetime.amount]]]
  [:unit [:? [:schema [:ref ::temporal-bucketing/unit.date-time.interval]]]])

(mbql-clause/define-tuple-mbql-clause :time :- :type/Time
  #_:timestr [:schema [:ref ::expression/string]]
  #_:unit [:ref ::temporal-bucketing/unit.time.interval])

;;; this has some stuff that's missing from [[::temporal-bucketing/unit.date-time.extract]], like `:week-of-year-iso`
(mr/def ::temporal-extract.unit
  [:enum
   {:decode/normalize common/normalize-keyword}
   :year-of-era
   :quarter-of-year
   :month-of-year
   :week-of-year-iso
   :week-of-year-us
   :week-of-year-instance
   :day-of-month
   :day-of-week
   :hour-of-day
   :minute-of-hour
   :second-of-minute])

;;; TODO -- this should make sure unit agrees with the type of expression we're extracting from.
(mbql-clause/define-catn-mbql-clause :temporal-extract :- :type/Integer
  [:datetime [:schema [:ref ::expression/temporal]]]
  [:unit     [:schema [:ref ::temporal-extract.unit]]]
  [:mode     [:? [:schema [:ref ::week-mode]]]])
