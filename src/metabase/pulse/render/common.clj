(ns metabase.pulse.render.common
  (:require [clojure.pprint :refer [cl-format]]
            [hiccup.util :as hutil]
            [metabase.shared.models.visualization-settings :as mb.viz]
            [metabase.shared.util.currency :as currency]
            [metabase.util.ui-logic :as ui-logic]
            [potemkin.types :as p.types]
            [schema.core :as s])
  (:import java.net.URL
           (java.text DecimalFormat DecimalFormatSymbols)))

;; Fool Eastwood into thinking this namespace is used
(comment hutil/keep-me)

(def RenderedPulseCard
  "Schema used for functions that operate on pulse card contents and their attachments"
  {:attachments                  (s/maybe {s/Str URL})
   :content                      [s/Any]
   (s/optional-key :render/text) (s/maybe s/Str)})

(p.types/defrecord+ NumericWrapper [num-str]
  hutil/ToString
  (to-str [_] num-str)

  Object
  (toString [_] num-str))

(defn number-formatter
  "Return a function that will take a number and format it according to its column viz settings. Useful to compute the
  format string once and then apply it over many values."
  [{:keys [effective_type base_type] col-id :id col-name :name  :as _column} viz-settings]
  (let [column-settings    (or (get-in viz-settings [::mb.viz/column-settings {::mb.viz/field-id col-id}])
                               (get-in viz-settings [::mb.viz/column-settings {::mb.viz/column-name col-name}]))
        global-settings    (::mb.viz/global-column-settings viz-settings)
        currency?          (boolean (or (= (::mb.viz/number-style column-settings) "currency")
                                        (and (nil? (::mb.viz/number-style column-settings))
                                             (or
                                              (::mb.viz/currency-style column-settings)
                                              (::mb.viz/currency column-settings)))))

        {::mb.viz/keys [number-separators decimals scale number-style
                        prefix suffix currency-style currency]} (merge
                                                                 (when currency?
                                                                   (:type/Currency global-settings))
                                                                 (:type/Number global-settings)
                                                                 column-settings)


        [decimal grouping] (or number-separators ".,")
        symbols            (doto (DecimalFormatSymbols.)
                             (cond-> decimal (.setDecimalSeparator decimal))
                             (cond-> grouping (.setGroupingSeparator grouping)))
        base               (if (= number-style "scientific") "0" "#,###")
        integral?          (isa? (or effective_type base_type) :type/Integer)
        fmt-str            (cond-> (cond
                                     decimals  (if (zero? decimals)
                                                 base
                                                 (apply str base "." (repeat decimals "0")))
                                     integral? base
                                     :else     (str base ".00"))
                             (= number-style "scientific") (str "E0")
                             (= number-style "percent")    (str "%"))
        fmtr               (DecimalFormat. fmt-str symbols)]
    (fn [value]
      (if (number? value)
        (NumericWrapper.
         (str (when prefix prefix)
              (when (and currency? (or (nil? currency-style)
                                       (= currency-style "symbol")))
                (get-in currency/currency [(keyword (or currency "USD")) :symbol]))
              (when (and currency? (= currency-style "code"))
                (str (get-in currency/currency [(keyword (or currency "USD")) :code]) \space))
              (.format fmtr (* value (or scale 1)))
              (when (and currency? (= currency-style "name"))
                (str \space (get-in currency/currency [(keyword (or currency "USD")) :name_plural])))
              (when suffix suffix)))
        value))))

(s/defn format-number :- NumericWrapper
  "Format a number `n` and return it as a NumericWrapper; this type is used to do special formatting in other
  `pulse.render` namespaces."
  ([n :- s/Num]
   (NumericWrapper. (cl-format nil (if (integer? n) "~:d" "~,2f") n)))
  ([value column viz-settings]
   (let [fmttr (number-formatter column viz-settings)]
     (fmttr value))))

(defn graphing-column-row-fns
  "Return a pair of `[get-x-axis get-y-axis]` functions that can be used to get the x-axis and y-axis values in a row,
  or columns, respectively."
  [card {:keys [cols] :as data}]
  [(or (ui-logic/x-axis-rowfn card data)
       first)
   (or (ui-logic/y-axis-rowfn card data)
       second)])

(defn non-nil-rows
  "Remove any rows that have a nil value for the `x-axis-fn` OR `y-axis-fn`"
  [x-axis-fn y-axis-fn rows]
  (filter (every-pred x-axis-fn y-axis-fn) rows))

(defn non-nil-combo-rows
  "Remove any rows that have a nil value for the entire row because
  the row-function-generating functions themselves choke on nil values, for combo rowfuncs"
  [rows]
  (filter #(every? some? %) rows))
