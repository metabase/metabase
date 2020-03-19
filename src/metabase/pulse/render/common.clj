(ns metabase.pulse.render.common
  (:require [clojure.pprint :refer [cl-format]]
            [hiccup.util :as hutil]
            [metabase.util.ui-logic :as ui-logic]
            [potemkin.types :as p.types]
            [schema.core :as s])
  (:import java.net.URL))

;; Fool Eastwood into thinking this namespace is used
(comment hutil/keep-me)

(def RenderedPulseCard
  "Schema used for functions that operate on pulse card contents and their attachments"
  {:attachments (s/maybe {s/Str URL})
   :content     [s/Any]})

(p.types/defrecord+ NumericWrapper [num-str]
  hutil/ToString
  (to-str [_] num-str)

  Object
  (toString [_] num-str))

(s/defn format-number :- NumericWrapper
  "Format a number `n` and return it as a NumericWrapper; this type is used to do special formatting in other
  `pulse.render` namespaces."
  [n :- s/Num]
  (NumericWrapper. (cl-format nil (if (integer? n) "~:d" "~,2f") n)))

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
