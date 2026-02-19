(ns metabase.util.i18n
  "ClojureScript implementation of i18n `tru` macros and the like."
  (:require
   ["ttag" :as ttag]
   [clojure.string :as str]
   [goog.object :as gobject])
  (:require-macros
   [metabase.util.i18n]))

(comment metabase.util.i18n/keep-me
         ttag/keep-me)

(defn- escape-format-string
  "Converts `''` to `'` inside the string; that's `java.text.MessageFormat` escaping that isn't needed in JS."
  [format-string]
  (str/replace format-string #"''" "'"))

(defn- make-template-strings-array
  "Creates a JavaScript array that mimics a TemplateStringsArray.
   Tagged template literals in JS pass arrays with a 'raw' property,
   which ttag uses for message ID lookup."
  [strings]
  (let [arr (clj->js strings)]
    (gobject/set arr "raw" arr)
    arr))

(defn js-i18n
  "Format an i18n `format-string` with `args` with a translated string in the user locale.

  The strings are formatted in `java.test.MessageFormat` style. That's used directly in JVM Clojure, but in CLJS we have
  to adapt to ttag, which doesn't have the same escaping rules.
  - 'xyz' single quotes wrap literal text which should not be interpolated, and could contain literal '{0}'.
  - A literal single quote is written with two single quotes: `''`
  The first part is not supported at all. `''` is converted to a single `'`."
  [format-string & args]
  (let [strings (-> format-string
                    escape-format-string
                    (str/split #"\{\d+\}"))
        template-strings (make-template-strings-array strings)]
    (apply ttag/t template-strings (clj->js args))))

(def ^:private re-param-zero #"\{0\}")

(defn js-i18n-n
  "Format an i18n `format-string` with the appropriate plural form based on the value `n`.
   Allows `n` to be interpolated into the string using {0}."
  [format-string format-string-pl n]
  (let [format-string-esc (escape-format-string format-string)
        strings           (str/split format-string-esc re-param-zero)
        has-n?            (re-find #".*\{0\}.*" format-string-esc)
        msg-id            (if has-n?
                            (ttag/msgid (clj->js strings) n)
                            (ttag/msgid (clj->js strings)))]
    (ttag/ngettext msg-id
                   (-> format-string-pl
                       escape-format-string
                       (str/replace re-param-zero (str n)))
                   n)))
