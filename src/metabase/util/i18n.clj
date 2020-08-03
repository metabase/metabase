(ns metabase.util.i18n
  "i18n functionality."
  (:require [cheshire.generate :as json-gen]
            [clojure
             [string :as str]
             [walk :as walk]]
            [clojure.tools.logging :as log]
            [metabase.util.i18n.impl :as impl]
            [potemkin :as p]
            [potemkin.types :as p.types]
            [schema.core :as s])
  (:import java.text.MessageFormat
           java.util.Locale))

(p/import-vars
 [impl
  available-locale?
  locale
  normalized-locale-string
  parent-locale
  translate])

(def ^:dynamic *user-locale*
  "Bind this to a string, keyword, or `Locale` to set the locale for the current User. To get the locale we should
  *use*, use the `user-locale` function instead."
  nil)

(defn site-locale
  "The default locale for this Metabase installation. Normally this is the value of the `site-locale` Setting."
  ^Locale []
  (locale (or (impl/site-locale-from-setting)
              ;; if DB is not initialized yet fall back to English
              "en")))

(defn user-locale
  "Locale we should *use* for the current User (e.g. `tru` messages) -- `*user-locale*` if bound, otherwise the system
  locale."
  ^Locale []
  (locale
   (or *user-locale*
       (site-locale))))

(defn available-locales-with-names
  "Returns all locale abbreviations and their full names"
  []
  (for [locale-name (impl/available-locale-names)]
    [locale-name (.getDisplayName (locale locale-name))]))

(defn translate-site-locale
  "Translate a string with the System locale."
  [format-string & args]
  (let [translated (apply translate (site-locale) format-string args)]
    (log/tracef "Translated %s for site locale %s -> %s" (pr-str format-string) (pr-str (site-locale)) (pr-str translated))
    translated))

(defn translate-user-locale
  "Translate a string with the current User's locale."
  [format-string & args]
  (let [translated (apply translate (user-locale) format-string args)]
    (log/tracef "Translating %s for user locale %s (site locale %s) -> %s"
                (pr-str format-string) (pr-str (user-locale)) (pr-str (site-locale)) (pr-str translated))
    translated))

(p.types/defrecord+ UserLocalizedString [format-string args]
  Object
  (toString [_]
    (apply translate-user-locale format-string args))
  schema.core.Schema
  (explain [this]
    (str this)))

(p.types/defrecord+ SiteLocalizedString [format-string args]
  Object
  (toString [_]
    (apply translate-site-locale format-string args))
  s/Schema
  (explain [this]
    (str this)))

(defn- localized-to-json
  "Write a UserLocalizedString or SiteLocalizedString to the `json-generator`. This is intended for
  `json-gen/add-encoder`. Ideallys we'd implement those protocols directly as it's faster, but currently that doesn't
  work with Cheshire"
  [localized-string json-generator]
  (json-gen/write-string json-generator (str localized-string)))

(json-gen/add-encoder UserLocalizedString localized-to-json)
(json-gen/add-encoder SiteLocalizedString localized-to-json)

(def LocalizedString
  "Schema for user and system localized string instances"
  (s/cond-pre UserLocalizedString SiteLocalizedString))

(defn- validate-number-of-args
  "Make sure the right number of args were passed to `trs`/`tru` and related forms during macro expansion."
  [format-string args]
  (assert (string? format-string)
          "The first arg to (deferred-)trs/tru must be a String! `gettext` does not eval Clojure files.")
  (let [message-format             (MessageFormat. format-string)
        ;; number of {n} placeholders in format string including any you may have skipped. e.g. "{0} {2}" -> 3
        expected-num-args-by-index (count (.getFormatsByArgumentIndex message-format))
        ;; number of {n} placeholders in format string *not* including ones you make have skipped. e.g. "{0} {2}" -> 2
        expected-num-args          (count (.getFormats message-format))
        actual-num-args            (count args)]
    (assert (= expected-num-args expected-num-args-by-index)
            (format "(deferred-)trs/tru with format string %s is missing some {} placeholders. Expected %s. Did you skip any?"
                    (pr-str (.toPattern message-format))
                    (str/join ", " (map (partial format "{%d}") (range expected-num-args-by-index)))))
    (assert (= expected-num-args actual-num-args)
            (str (format (str "(deferred-)trs/tru with format string %s expects %d args, got %d.")
                         (pr-str (.toPattern message-format)) expected-num-args actual-num-args)
                 " Did you forget to escape a single quote?"))))

(defmacro deferred-tru
  "Similar to `tru` but creates a `UserLocalizedString` instance so that conversion to the correct locale can be delayed
  until it is needed. The user locale comes from the browser, so conversion to the localized string needs to be 'late
  bound' and only occur when the user's locale is in scope. Calling `str` on the results of this invocation will
  lookup the translated version of the string."
  [format-string & args]
  (validate-number-of-args format-string args)
  `(UserLocalizedString. ~format-string ~(vec args)))

(defmacro deferred-trs
  "Similar to `trs` but creates a `SiteLocalizedString` instance so that conversion to the correct locale can be
  delayed until it is needed. This is needed as the system locale from the JVM can be overridden/changed by a setting.
  Calling `str` on the results of this invocation will lookup the translated version of the string."
  [format-string & args]
  (validate-number-of-args format-string args)
  `(SiteLocalizedString. ~format-string ~(vec args)))

(def ^String ^{:arglists '([& args])} str*
  "Ensures that `trs`/`tru` isn't called prematurely, during compilation."
  (if *compile-files*
    (fn [& _]
      (throw (Exception. "Premature i18n string lookup. Is there a top-level call to `trs` or `tru`?")))
    str))

(defmacro tru
  "Applies `str` to `deferred-tru`'s expansion.
  Prefer this over `deferred-tru`. Use `deferred-tru` only in code executed at compile time, or where `str` is manually
  applied to the result."
  [format-string & args]
  `(str* (deferred-tru ~format-string ~@args)))

(defmacro trs
  "Applies `str` to `deferred-trs`'s expansion.
  Prefer this over `deferred-trs`. Use `deferred-trs` only in code executed at compile time, or where `str` is manually
  applied to the result."
  [format-string & args]
  `(str* (deferred-trs ~format-string ~@args)))

;; TODO - I seriously doubt whether these are still actually needed now that `tru` and `trs` generate forms wrapped in
;; `str` by default
(defn localized-string?
  "Returns true if `x` is a system or user localized string instance"
  [x]
  (boolean (some #(instance? % x) [UserLocalizedString SiteLocalizedString])))

(defn localized-strings->strings
  "Walks the datastructure `x` and converts any localized strings to regular string"
  [x]
  (walk/postwalk (fn [node]
                   (cond-> node
                     (localized-string? node) str))
                 x))
