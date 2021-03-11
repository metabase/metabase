(ns metabase.util.visualization-settings
  "Utility functions for dealing with visualization settings on the backend."
  (:require [clojure.string :as str]
            [schema.core :as s]
            [metabase.util.schema :as su]
            [metabase.query-processor.streaming.common :as common])
  (:import (java.time.format DateTimeFormatter)
           (java.time.temporal TemporalAccessor)
           (java.text DecimalFormat)))

;; a column map can look like any of these
;; from an export test
;; {:name CAM, :base_type :type/Text}
;; from a custom column added in query builder
;; { :base_type :type/BigInteger,
;    :semantic_type :type/Number,
;    :name "negative_id",
;    :display_name "negative_id",
;    :expression_name "negative_id",
;    :field_ref [:expression "negative_id"],
;    :source :fields}
;; from a "regular" column
;; {:description The total billed amount., :semantic_type nil, :table_id 37, :name TOTAL, :settings nil,
;;  :source :fields, :field_ref [:field 143 nil], :parent_id nil, :id 143, :visibility_type :normal,
;;  :display_name Total, :fingerprint {:global {:distinct-count 4426, :nil% 0.0},
;;  :type {:type/Number {:min 8.93914247937167, :q1 51.34535490743823, :q3 110.29428389265787, :max 159.34900526552292,
;;                       :sd 34.26469575709948, :avg 80.35871658771228}}},
;;  :base_type :type/Float}

(def Column (su/open-schema
              {(s/optional-key :id) su/IntGreaterThanZero
               (s/optional-key :expression_name) s/Str
               (s/optional-key :name) s/Str}))

(def ColSetting s/Any)

;; the :column_settings map can look like this:
;; {:["ref",["field",140,null]]           {:date_style "YYYY/M/D", :time_enabled "minutes", :time_style "k:mm"},
;   :["ref",["field",145,null]]           {:column_title "Renamed_ID"},
;   :["ref",["expression","negative_id"]] {:number_separators ", "}}}
(def ColSettings {s/Keyword ColSetting})

(def VizSettings (s/maybe (su/open-schema
                            {(s/required-key :column_settings) ColSettings})))

(defn- field-id-key [col]
  (format "[\"ref\",[\"field\",%d,null]]" (:id col)))

(defn- expression-key [col]
  (format "[\"ref\",[\"expression\",\"%s\"]]" (:expression_name col)))

(defn- find-col-setting [{:keys [column_settings]} col]
  (or (get column_settings (field-id-key col))
      (get column_settings (expression-key col))))

;;export type DateStyle =
;  | "M/D/YYYY"
;  | "D/M/YYYY"
;  | "YYYY/M/D"
;  | "MMMM D, YYYY"
;  | "MMMM D, YYYY"
;  | "D MMMM, YYYY"
;  | "dddd, MMMM D, YYYY";
;
;export type TimeStyle = "h:mm A" | "k:mm" | "h A";

;; see: https://github.com/MadMG/moment-jdateformatparser
(defn momentjs-to-java-format
  "Parameter names are deliberately chosen to match what the frontend sends."
  [date_style date_abbreviate time_style time_enabled]
  (let [dt-str (case date_style
                 "M/D/YYYY" "M/d/YYYY"
                 "D/M/YYYY" "d/M/YYYY"
                 "YYYY/M/D" "YYYY/M/d"
                 ;; Jan 7, 2018 or January 7, 2018
                 "MMMM D, YYYY" (if date_abbreviate "MMM d YYYY" "MMMM d YYYY")
                 ;; 7 Jan, 2018 or 7 January, 2018
                 "D MMMM, YYYY" (if date_abbreviate "d MMM YYYY" "d MMMM YYYY")
                 ;; Sun, Jan 7, 2018 or Sunday, January 7, 2018
                 "dddd, MMMM D, YYYY" (if date_abbreviate "EEE, MMM d, YYYY" "EEEE, MMMM d, YYYY"))
        sub-day  (case time_enabled
                   nil            ""
                   "minutes"      ""
                   "seconds"      ":ss"
                   "milliseconds" ":ss:SSS")
        time-str (when (some? time_enabled)
                   (case time_style
                     nil      nil
                     ;; 17:24 (with seconds/millis as per time-enabled)
                     "k:mm"   (format "H:mm%s" sub-day)
                     ;; 5:24 PM (with seconds/millis as per above)
                     "h:mm A" (format "h:mm%s a" sub-day)
                     "HH:mm" (format "H:mm%s" sub-day)))]
    (format "%s%s" dt-str (if (some? time-str) (str ", " time-str) ""))))

(defn date-format-fn [{:keys [date_style date_abbreviate time_style time_enabled]}]
  (let [fmt-str   (momentjs-to-java-format date_style date_abbreviate time_style time_enabled)
        formatter (DateTimeFormatter/ofPattern fmt-str)]
    #(.format formatter %)))

(defn number-format-fn [{:keys [decimals number_separators number_style prefix suffix]}]
  ;; decimals is the number of decimal digits to show
  ;; number_separators is a two-char string; decimal point character then group (thousands) separator
  ;; number_style is either "decimal" "percent" "scientific" or "currency"
  ;; prefix and suffix are just strings to prepend and append, respectively
  (let [quote-lit  (fn [val]
                     (if (str/blank? val)
                       ""
                       ;; literals in DecimalFormat need single quoted, with a literal single quote needing escaped
                       (format "'%s'" (str/replace val "'" "''"))))
        dec-sep    (or (first number_separators) ".")
        group-sep  (or (last number_separators) ",")
        dec-part   (if (pos-int? decimals) (apply str (conj (repeat decimals \0) dec-sep)) "")
        formatter  (DecimalFormat. (format "%s%s###%s%s" (quote-lit prefix) group-sep dec-part (quote-lit suffix)))]
    #(.format formatter %)))

(defn- always-dispatch-on-first-val-pred
  "Returns a stateful function of a single `arg` that will invoke `(fn-if arg)` when `(pred arg)` returns true, and
  `(fn-else arg)` otherwise. Only the first `arg` value ever passed to this `fn` is checked against the predicate `fn`;
  all subsequent values passed for `arg` to the returned `fn` are assumed to also satisfy the predicate. This is a
  reasonable assumption for certain scenarios, such as subsequent rows, at the same column position, from a single JDBC
  `ResultSet`"
  [pred fn-if fn-else]
  (let [res (atom nil)]
    (fn [val]
      (if (nil? @res)
        ;; predicate never checked; call it now
        (reset! res (pred val)))
      (if @res (fn-if val) (fn-else val)))))

(defn- fmt-fn-or-default
  "Returns a function that will call fmt-fn if pred is true for the first value passed, else will call the
  common/format-value protocol fn."
  [pred fmt-fn]
  (always-dispatch-on-first-val-pred pred fmt-fn common/format-value))

(defn make-format-metadata [visualization-settings col]
  ;; always provide a default format fn
  (let [fmt-md {:format-fn common/format-value}]
    (if-some [col-settings (find-col-setting visualization-settings col)]
      (let [number-keys (select-keys col-settings [:decimals :number_separator :number_style])]
        (-> (merge col-settings fmt-md) ; merge in col-settings with our format metadata
            ;; if a date_style exists, add a date specific format fn
            (cond-> (:date_style col-settings) (assoc :format-fn (fmt-fn-or-default
                                                                  #(instance? TemporalAccessor %)
                                                                  (date-format-fn col-settings))))
            (cond-> (not-empty number-keys) (assoc :format-fn (fmt-fn-or-default
                                                               #(instance? Number %)
                                                               (number-format-fn col-settings))))))
      fmt-md)))

(defn column-title-override [visualization-settings col]
  (when-some [col-settings (find-col-setting visualization-settings col)]
    (:column_title col-settings)))

(s/defn col-settings-key
  "Gets the key that would be mapped under :column_settings for the given col (a Column domain object)."
  [col :- Column]
  (keyword (format "[\"ref\",[\"field\",%d,null]]" (:id col))))

(s/defn col-settings :- (s/maybe ColSetting)
  "Gets the column_settings value mapped by the given col (a Column domain object) as a key (a Column domain object)."
  [{:keys [column_settings] :as visualization-settings} :- VizSettings col :- Column]
  (get column_settings (col-settings-key col)))

(s/defn date-format-from-col-settings [visualization-settings :- VizSettings col  :- Column] :- (s/maybe s/Str)
  (let [settings (find-col-setting visualization-settings col)]
    (if-let [date-style (:date_style settings)]
      (str date-style (if-let [time-style (:time_style settings)] (str " " time-style) "")))))
