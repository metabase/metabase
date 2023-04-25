(ns metabase.lib.schema.literal
  "Malli schemas for string, temporal, number, and boolean literals."
  (:require
   [malli.core :as mc]
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.util.malli.registry :as mr]
   #?@(:clj ([metabase.lib.schema.literal.jvm]))))

(defmethod expression/type-of* :dispatch-type/nil
  [_nil]
  :type/*)

(mr/def ::boolean
  :boolean)

(defmethod expression/type-of* :dispatch-type/boolean
  [_bool]
  :type/Boolean)

(mr/def ::boolean
  :boolean)

(mr/def ::integer
  #?(:clj [:or
           :int
           :metabase.lib.schema.literal.jvm/big-integer]
     :cljs :int))

(defmethod expression/type-of* :dispatch-type/integer
  [_int]
  :type/Integer)

;;; we should probably also restrict this to disallow NaN and positive/negative infinity, I don't know in what
;;; universe we'd want to allow those if they're not disallowed already.
(mr/def ::non-integer-real
  #?(:clj [:or
           :double
           :metabase.lib.schema.literal.jvm/float
           :metabase.lib.schema.literal.jvm/big-decimal]
     :cljs :double))

(defmethod expression/type-of* :dispatch-type/number
  [_non-integer-real]
  ;; `:type/Float` is the 'base type' of all non-integer real number types in [[metabase.types]] =(
  :type/Float)

(mr/def ::string
  :string)

;;; TODO -- these temporal literals could be a little stricter, right now they are pretty permissive, you shouldn't be
;;; allowed to have month `13` or `02-29` for example

(def ^:private year-part
  "\\d{4}")

(def ^:private month-part
  "\\d{2}")

(def ^:private day-part
  "\\d{2}")

(def ^:private date-part
  (str year-part \- month-part \- day-part))

(def ^:private hour-part
  "\\d{2}")

(def ^:private minutes-part
  "\\d{2}")

(defn- optional [& parts]
  (str "(?:" (apply str parts) ")?"))

(def ^:private seconds-milliseconds-part
  (str ":\\d{2}" (optional "\\.\\d{1,6}")))

(def ^:private time-part
  (str hour-part \: minutes-part (optional seconds-milliseconds-part)))

(def ^:private date-time-part
  (str date-part \T time-part))

(def ^:private offset-part
  (str "(?:Z|(?:[+-]" time-part "))"))

(def ^:private ^:const local-date-regex
  (re-pattern (str \^ date-part \$)))

(def ^:private ^:const local-time-regex
  (re-pattern (str \^ time-part \$)))

(def ^:private ^:const offset-time-regex
  (re-pattern (str \^ time-part offset-part \$)))

(def ^:private ^:const local-datetime-regex
  (re-pattern (str \^ date-time-part \$)))

(def ^:private ^:const offset-datetime-regex
  (re-pattern (str \^ date-time-part offset-part \$)))

(mr/def ::string.date
  [:re
   {:error/message "date string literal"}
   local-date-regex])

(mr/def ::string.time
  [:or
   [:re
    {:error/message "local time string literal"}
    local-time-regex]
   [:re
    {:error/message "offset time string literal"}
    offset-time-regex]])

(mr/def ::string.datetime
  [:or
   [:re
    {:error/message "local date time string literal"}
    local-datetime-regex]
   [:re
    {:error/message "offset date time string literal"}
    offset-datetime-regex]])

(defmethod expression/type-of* :dispatch-type/string
  [s]
  (condp mc/validate s
    ::string.datetime #{:type/Text :type/DateTime}
    ::string.date     #{:type/Text :type/Date}
    ::string.time     #{:type/Text :type/Time}
    :type/Text))

(mr/def ::date
  #?(:clj  [:or
            :time/local-date
            ::string.date]
     :cljs ::string.date))

(mr/def ::time
  #?(:clj [:or
           ::string.time
           :time/local-time
           :time/offset-time]
     :cljs ::string.time))

(mr/def ::datetime
  #?(:clj [:or
           ::string.datetime
           :time/local-date-time
           :time/offset-date-time
           :time/zoned-date-time]
     :cljs ::string.datetime))

(mr/def ::temporal
  [:or
   ::date
   ::time
   ::datetime])

;;; these are currently only allowed inside `:absolute-datetime`

(def ^:const year-month-regex
  "Regex for a year-month literal string."
  (re-pattern (str \^ year-part \- month-part \$)))

(mr/def ::string.year-month
  [:re
   {:error/message "year-month string literal"}
   year-month-regex])

(def ^:const year-regex
  "Regex for a year literal string."
  (re-pattern (str \^ year-part \$)))

(mr/def ::string.year
  [:re
   {:error/message "year string literal"}
   year-regex])

;;; `:effective-type` is required for `:value` clauses. This was not a rule in the legacy MBQL schema, but in actual
;;; usage they basically always have `:base-type`; in MLv2 we're trying to use `:effective-type` everywhere instead;
;;; These clauses are useless/pointless without type information anyway, so let's enforce this rule going forward.
;;; Conversion can take care of `:base-type` <=> `:effective-type` as needed.
(mr/def ::value.options
  [:merge
   [:ref ::common/options]
   [:map
    [:effective-type ::common/base-type]]])

;;; [:value <opts> <value>] clauses are mostly used internally by the query processor to add type information to
;;; literals, to make it easier for drivers to process queries; see
;;; the [[metabase.query-processor.middleware.wrap-value-literals]] middleware. It is also used to differentiate `nil`
;;; (as in no clause or value) from something intended to be `NULL` in a compiled query, and to associate type
;;; information with that `nil`. Even if this is mostly used internally, the schema still needs to know about it.
;;;
;;; The schema itself does not currently enforce that the actual <value> matches up with the `:effective-type` in the
;;; options map; this is only enforced in the QP. For now, it assumes you know what you are doing and takes your word
;;; for it when you say something has a given `:effective-type`.
(mbql-clause/define-mbql-clause :value
  [:tuple
   {:error/message "Value :value clause"}
   #_tag   [:= :value]
   #_opts  [:ref ::value.options]
   #_value any?])
