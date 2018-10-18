(ns metabase.util.honeysql-extensions-test
  (:require [expectations :refer :all]
            [honeysql.format :as hformat]
            [metabase.util.honeysql-extensions :as hsql-ext])
  (:import java.util.Locale))

;; Basic format test not including a specific quoting option
(expect
  ["setting"]
  (hformat/format :setting))

;; `:h2` quoting will uppercase and quote the identifier
(expect
  ["\"SETTING\""]
  (hformat/format :setting :quoting :h2))

(defn- call-with-locale
  "Sets the default locale temporarily to `locale-tag`, then invokes `f` and reverts the locale change"
  [locale-tag f]
  (let [current-locale (Locale/getDefault)]
    (try
      (Locale/setDefault (Locale/forLanguageTag locale-tag))
      (f)
      (finally
        (Locale/setDefault current-locale)))))

(defmacro ^:private with-locale [locale-tag & body]
  `(call-with-locale ~locale-tag (fn [] ~@body)))

;; We provide our own quoting function for `:h2` databases. We quote and uppercase the identifier. Using Java's
;; toUpperCase method is surprisingly locale dependent. When uppercasing a string in a language like Turkish, it can
;; turn an i into an İ. This test converts a keyword with an `i` in it to verify that we convert the identifier
;; correctly using the english locale even when the user has changed the locale to Turkish
(expect
  ["\"SETTING\""]
  (with-locale "tr"
   (hformat/format :setting :quoting :h2)))
