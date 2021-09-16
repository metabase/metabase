(ns metabase.pulse.render.common
  (:require [clojure.pprint :refer [cl-format]]
            [hiccup.util :as hutil]
            [metabase.public-settings :as public-settings]
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
  ([col-viz]
   (number-formatter col-viz (mb.viz/db->norm-column-settings-entries
                              (:type/Number (public-settings/custom-formatting)))))
  ([col-viz site-settings]
   (let [{::mb.viz/keys [number-separators decimals scale number-style
                         prefix suffix currency-style currency]} (merge site-settings col-viz)

         currency?          (boolean (or (= number-style "currency")
                                         (and (nil? number-style)
                                              (or
                                               currency-style
                                               currency))))
         [decimal grouping] (or number-separators ".,")
         symbols            (doto (DecimalFormatSymbols.)
                              (cond-> decimal (.setDecimalSeparator decimal))
                              (cond-> grouping (.setGroupingSeparator grouping)))
         base               (if (= number-style "scientific") "0" "#,###")
         fmt-str            (cond-> (cond
                                      decimals  (apply str base "." (repeat decimals "0"))
                                      currency? (str base ".00")
                                      :else     (str base ".##"))
                              (= number-style "scientific") (str "E0")
                              (= number-style "percent")    (str "%"))
         fmtr               (DecimalFormat. fmt-str symbols)]
     (fn [value]
       (when value
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
               (when suffix suffix))))))))

(s/defn format-number :- NumericWrapper
  "Format a number `n` and return it as a NumericWrapper; this type is used to do special formatting in other
  `pulse.render` namespaces."
  ([n :- s/Num]
   (NumericWrapper. (cl-format nil (if (integer? n) "~:d" "~,2f") n)))
  ([value col-viz]
   (let [fmttr (number-formatter col-viz)]
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
