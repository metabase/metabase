(ns metabase.shared.util.i18n
  (:require ["metabase/lib/i18n" :as i18n]
            ["ttag" :as ttag])
  (:require-macros metabase.shared.util.i18n))

(comment metabase.shared.util.i18n/keep-me
         ttag/keep-me)

(defn js-tru
  "Format an i18n `format-string` with `args` with a translated string in the user locale."
  [format-string & args]
  (apply ttag/gettext format-string args))

(defn js-trs
  "Format an i18n `format-string` with `args` with a translated string in the site locale."
  [format-string & args]
  (i18n/withInstanceLanguage
   (fn [] (apply ttag/gettext format-string args))))
