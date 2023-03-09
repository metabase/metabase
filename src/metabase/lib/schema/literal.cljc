(ns metabase.lib.schema.literal
  "Malli schemas for string, temporal, number, and boolean literals."
  (:require
   [metabase.util.malli.registry :as mr]))

(mr/def ::boolean
  :boolean)

;;; TODO -- for Clojure, we should also add BigInteger
(mr/def ::integer
  :int)

;;; TODO -- for Clojure, we should also add BigDecimal, and `:float`:
;;;
;;; (malli.core/validate :double (float 1.0)) => false
;;;
;;; we should probably also restrict this to disallow NaN and positive/negative infinity, I don't know in what
;;; universe we'd want to allow those if they're not disallowed already.
(mr/def ::non-integer-real
  :double)

(mr/def ::string
  :string)

;;; TODO -- these temporal literals could be a little stricter, right now they are pretty permissive, you shouldn't be
;;; allowed to have month `13` or `02-29` for example

(def ^:private date-part-regex #"\d{4}-\d{2}-\d{2}")

(def ^:private time-part-regex #"\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?")

(def ^:private offset-part-regex
  ;; I think technically a zone offset can have a seconds part too but let's not worry too much about supporting that
  ;; for now.
  (re-pattern (str "(?:Z|" time-part-regex ")")))

(def ^:private local-date-regex
  (re-pattern (str "^" date-part-regex "$")))

(def ^:private local-time-regex
  (re-pattern (str "^" time-part-regex "$")))

(def ^:private offset-time-regex
  (re-pattern (str "^" time-part-regex offset-part-regex "$")))

(def ^:private local-date-time-regex
  (re-pattern (str "^" date-part-regex "T" time-part-regex "$")))

(def ^:private offset-date-time-regex
  (re-pattern (str "^" date-part-regex "T" time-part-regex offset-part-regex "$")))

;; e.g. 2022-02-23
(mr/def ::date.local
  #?(:clj [:or
           :time/local-date
           [:re local-date-regex]]
     :cljs [:re local-date-regex]))

(mr/def ::date
  ;; we don't currently support offset dates :shrug:
  ::date.local)

;; e.g. 13:12 or 13:12:00 or 13:12:00.000
(mr/def ::time.local
  #?(:clj [:or
           :time/local-time
           [:re local-time-regex]]
     :cljs [:re local-time-regex]))

(mr/def ::time.offset
  #?(:clj [:or
           :time/offset-time
           [:re offset-time-regex]]
     :cljs [:re offset-time-regex]))

(mr/def ::time
  [:or
   ::time.local
   ::time.offset])

(mr/def ::date-time.local
  (let [re [:re {:error/message "local date time string literal"} local-date-time-regex]]
    #?(:clj [:or
             {:error/message "local date time literal"}
             [:schema
              {:error/message "instance of java.time.LocalDateTime"}
              :time/local-date-time]
             re]
       :cljs re)))

(mr/def ::date-time.offset
  (let [re [:re {:error/message "offset date time string literal"} offset-date-time-regex]]
    #?(:clj [:or
             :time/offset-date-time
             :time/zoned-date-time
             re]
       :cljs re)))

(mr/def ::date-time
  [:or
   {:error/message "date time literal"}
   ::date-time.local
   ::date-time.offset])

(mr/def ::temporal
  [:or
   ::date
   ::time
   ::date-time])
