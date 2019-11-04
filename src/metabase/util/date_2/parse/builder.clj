(ns metabase.util.date-2.parse.builder
  (:require [metabase.util.date-2.common :as common])
  (:import [java.time.format DateTimeFormatter DateTimeFormatterBuilder SignStyle]
           java.time.temporal.ChronoField))

(defprotocol BuilderPart
  (apply-part [this builder]))

(extend-protocol BuilderPart
  String
  (apply-part [this builder]
    (.appendLiteral ^DateTimeFormatterBuilder builder this))

  clojure.lang.Fn
  (apply-part [this builder]
    (this builder))

  DateTimeFormatter
  (apply-part [this builder]
    (.append ^DateTimeFormatterBuilder builder this)))

(defn apply-parts [builder parts]
  (doseq [part parts]
    (apply-part part builder)))

(defn optional [& parts]
  (reify BuilderPart
    (apply-part [_ builder]
      (.optionalStart ^DateTimeFormatterBuilder builder)
      (apply-parts builder parts)
      (.optionalEnd ^DateTimeFormatterBuilder builder))))

(defn- set-option [^DateTimeFormatterBuilder builder option]
  (case option
    :strict           (.parseStrict builder)
    :lenient          (.parseLenient builder)
    :case-sensitive   (.parseCaseSensitive builder)
    :case-insensitive (.parseCaseInsensitive builder)))

(def ^:private ^:dynamic *options*
  {:strictness       :strict
   :case-sensitivity :case-sensitive})

(defn- do-with-option [builder k new-value thunk]
  (let [old-value (get *options* k)]
    (if (= old-value new-value)
      (thunk)
      (binding [*options* (assoc *options* k new-value)]
        (set-option builder new-value)
        (thunk)
        (set-option builder old-value)))))

(defn- with-option-part [k v parts]
  (reify BuilderPart
    (apply-part [_ builder]
      (do-with-option builder k v (fn [] (apply-parts builder parts))))))

(defn strict [& parts]
  (with-option-part :strictness :strict parts))

(defn lenient [& parts]
  (with-option-part :strictness :lenient parts))

(defn case-sensitive [& parts]
  (with-option-part :case-sensitivity :case-sensitive parts))

(defn case-insensitive [& parts]
  (with-option-part :case-sensitivity :case-insensitive parts))

(def ^:private ^ChronoField chrono-field
  (common/static-instances ChronoField))

(def ^:private ^SignStyle sign-style
  (common/static-instances SignStyle))

(def ^:private ^:dynamic *case-sensitive?* true)

(defn value
  ([chrono-field-name]
   (fn [^DateTimeFormatterBuilder builder]
     (.appendValue builder (chrono-field chrono-field-name))))

  ([chrono-field-name width]
   (fn [^DateTimeFormatterBuilder builder]
     (.appendValue builder (chrono-field chrono-field-name) width)))

  ([chrono-field-name min-val max-val sign-style-name]
   (fn [^DateTimeFormatterBuilder builder]
     (.appendValue builder (chrono-field chrono-field-name) min-val max-val (sign-style sign-style-name)))))

(defn default-value [chrono-field-name default-value]
  (fn [^DateTimeFormatterBuilder builder]
    (.parseDefaulting builder (chrono-field chrono-field-name) default-value)))

(defn fraction
  [chrono-field-name min-val-width max-val-width & {:keys [decimal-point?]}]
  (fn [^DateTimeFormatterBuilder builder]
    (.appendFraction builder (chrono-field chrono-field-name) 0 9 (boolean decimal-point?))))

(defn offset-id []
  (lenient
   (fn [^DateTimeFormatterBuilder builder]
     (.appendOffsetId builder))))

(defn offset-zone-id []
  (strict
   (case-sensitive
    "["
    (fn [^DateTimeFormatterBuilder builder]
      (.appendZoneOrOffsetId builder))
    "]")))

(defn build-formatter
  ^DateTimeFormatter [& parts]
  (let [builder (DateTimeFormatterBuilder.)]
    (apply-parts builder parts)
    (.toFormatter builder)))
