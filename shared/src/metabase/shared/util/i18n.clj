(ns metabase.shared.util.i18n
  (:require [net.cgrand.macrovich :as macros]))

(defmacro tru
  [format-string & args]
  (macros/case
    :clj
    `(metabase.util.i18n/tru ~format-string ~@args)

    :cljs
    `(js-i18n ~format-string ~@args)))
