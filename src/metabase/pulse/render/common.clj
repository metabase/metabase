(ns metabase.pulse.render.common
  (:require [clojure.pprint :refer [cl-format]]
            [hiccup.util :as hutil]
            [metabase.util.ui-logic :as ui-logic]
            [schema.core :as s])
  (:import java.net.URL))

(def RenderedPulseCard
  "Schema used for functions that operate on pulse card contents and their attachments"
  {:attachments (s/maybe {s/Str URL})
   :content     [s/Any]})

(defrecord NumericWrapper [num-str]
  hutil/ToString
  (to-str [_] num-str)

  Object
  (toString [_] num-str))

(defn format-number
  [n]
  (NumericWrapper. (cl-format nil (if (integer? n) "~:d" "~,2f") n)))

(defn graphing-column-row-fns [card {:keys [cols] :as data}]
  [(or (ui-logic/x-axis-rowfn card data)
       first)
   (or (ui-logic/y-axis-rowfn card data)
       second)])

(defn non-nil-rows
  "Remove any rows that have a nil value for the `x-axis-fn` OR `y-axis-fn`"
  [x-axis-fn y-axis-fn rows]
  (filter (every-pred x-axis-fn y-axis-fn) rows))
