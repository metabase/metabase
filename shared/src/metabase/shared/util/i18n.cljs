(ns metabase.shared.util.i18n
  (:require ["ttag" :as ttag]
            [clojure.string :as str])
  (:require-macros metabase.shared.util.i18n))

(comment metabase.shared.util.i18n/keep-me
         ttag/keep-me)

(defn js-i18n
  "Format an i18n `format-string` with `args` with a translated string in the user locale."
  [format-string & args]
  (let [strings (str/split format-string #"\{\d+\}")]
    (apply ttag/t (clj->js strings) (clj->js args))))

(defn js-i18n-n
  "Format an i18n `format-string` with the appropritae plural form based on the value `n`.
   Allows `n` to be interpolated into the string using {0}."
  [format-string format-string-pl n]
  (let [strings (str/split format-string #"\{0\}")
        strings (if (= (count strings) 1) [format-string ""] strings)
        has-n?  (re-find #".*\{0\}.*" format-string)]
    (ttag/ngettext (ttag/msgid (clj->js strings) (if has-n? n ""))
                   format-string-pl
                   n)))
