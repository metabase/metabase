(ns metabase.shared.util.i18n
  (:require ["ttag" :as ttag])
  (:require-macros metabase.shared.util.i18n))

(comment metabase.shared.util.i18n/keep-me
         ttag/keep-me)

;; TODO -- this definitely isn't working right.
(defn js-i18n [format-string & args]
  (apply ttag/gettext format-string args))
