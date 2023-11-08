(ns metabase.shared.util.i18n
  (:require ["ttag" :as ttag])
  (:require-macros metabase.shared.util.i18n))

(comment metabase.shared.util.i18n/keep-me
         ttag/keep-me)

(defn js-i18n
  "Format an i18n `format-string` with `args` with a translated string in the user locale."
  [format-string & args]
  (apply ttag/gettext format-string args))
