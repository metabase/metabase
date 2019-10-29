(ns metabase.util.date-2.parse.builder
  (:require [metabase.util.date-2.common :as common])
  (:import [java.time.format DateTimeFormatter DateTimeFormatterBuilder SignStyle]
           java.time.temporal.ChronoField))

(def ^:private ^ChronoField chrono-field
  (common/static-instances ChronoField))

(def ^:private ^SignStyle sign-style
  (common/static-instances SignStyle))

(def ^:private ^:dynamic *case-sensitive?* true)

(defn- set-case-sensitive! [^DateTimeFormatterBuilder builder case-sensitive?]
  (if case-sensitive?
    (.parseCaseSensitive builder)
    (.parseCaseInsensitive builder)))

(defn- do-with-case-sensitivity [builder case-sensitive? thunk]
  (if (= case-sensitive? *case-sensitive?*)
    (thunk)
    (let [old *case-sensitive?*]
      (binding [*case-sensitive?* case-sensitive?]
        (set-case-sensitive! builder case-sensitive?)
        (thunk)
        (set-case-sensitive! builder old)))))

(defn case-insensitive [& forms]
  (fn [builder]
    (do-with-case-sensitivity builder false (fn [] (doseq [form forms] (form builder))))))

(defn case-sensitive [& forms]
  (fn [builder]
    (do-with-case-sensitivity builder true (fn [] (doseq [form forms] (form builder))))))


(def ^:private ^:dynamic *strict?* true)

(defn- set-strict! [^DateTimeFormatterBuilder builder strict?]
  ;; TODO - what about ResolverStyle/SMART ?
  (if strict?
    (.parseStrict builder)
    (.parseLenient builder)))

(defn- do-with-strict-parsing [builder strict? thunk]
  (if (= strict? *strict?*)
    (thunk)
    (binding [*strict?* strict?]
      (set-strict! builder strict?)
      (thunk)
      (set-strict! builder (not strict?)))))

(defn strict [& forms]
  (fn [builder]
    (do-with-strict-parsing builder true (fn [] (doseq [form forms] (form builder))))))

(defn lenient [& forms]
  (fn [builder]
    (do-with-strict-parsing builder false (fn [] (doseq [form forms] (form builder))))))

(defn value
  ([chrono-field-name]
   (fn [^DateTimeFormatterBuilder builder]
     (.appendValue builder (chrono-field chrono-field-name))))

  ([chrono-field-name width]
   (fn [^DateTimeFormatterBuilder builder]
     (.appendValue builder (chrono-field chrono-field-name) width)))

  ([chrono-field-name min max sign-style-name]
   (fn [^DateTimeFormatterBuilder builder]
     (.appendValue builder (chrono-field chrono-field-name) min max (sign-style sign-style-name)))))

(defn default-value [chrono-field-name default-value]
  (fn [^DateTimeFormatterBuilder builder]
    (.parseDefaulting builder (chrono-field chrono-field-name) default-value)))

(defn fraction
  [chrono-field-name min-width max-width & {:keys [decimal-point?]}]
  (fn [^DateTimeFormatterBuilder builder]
    (.appendFraction builder (chrono-field chrono-field-name) 0 9 (boolean decimal-point?))))

(defn optional [& parts]
  (fn [^DateTimeFormatterBuilder builder]
    (.optionalStart builder)
    (doseq [part parts]
      (part builder))
    (.optionalEnd builder)))

(defn literal [^String s]
  (fn [^DateTimeFormatterBuilder builder]
    (.appendLiteral builder s)))

(defn append [^DateTimeFormatter formatter]
  (fn [^DateTimeFormatterBuilder builder]
    (.append builder formatter)))

(defn offset-id []
  (lenient
   (fn [^DateTimeFormatterBuilder builder]
     (.appendOffsetId builder))))

(defn offset-zone-id []
  (strict
   (case-sensitive
    (literal "[")
    (fn [^DateTimeFormatterBuilder builder]
      (.appendZoneOrOffsetId builder))
    (literal "]"))))

(defn build-formatter
  ^DateTimeFormatter [& parts]
  (let [builder (DateTimeFormatterBuilder.)]
    (doseq [part parts]
      (part builder))
    (.toFormatter builder)))
