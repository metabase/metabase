(ns metabase.pulse.render.common
  (:require [schema.core :as s]
            [clojure.pprint :refer [cl-format]])
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
