(ns metabase.util.i18n
  (:refer-clojure :exclude [ex-info])
  (:require [cheshire.generate :as json-gen]
            [clojure.walk :as walk]
            [metabase.util.i18n.impl :as impl]
            [potemkin :as p]
            [potemkin.types :as p.types]
            [schema.core :as s])
  (:import java.text.MessageFormat
           java.util.Locale))

(p/import-vars
 [impl
  locale
  parent-locale
  translate])

(def ^:dynamic *user-locale*
  "Bind this to a string, keyword, or `Locale` to set the locale for the current User. To get the locale we should
  *use*, use the `user-locale` function instead."
  nil)

(defn system-locale
  "The default locale for this Metabase installation. Normally this is the value of the `site-locale` Setting."
  ^Locale []
  (locale (or (impl/system-locale-from-setting)
              ;; if DB is not initialized yet fall back to English
              "en")))

(defn user-locale
  "Locale we should *use* for the current User (e.g. `tru` messages) -- `*user-locale*` if bound, otherwise the system
  locale."
  ^Locale []
  (locale
   (or *user-locale*
       (system-locale))))

(defn available-locales-with-names
  "Returns all locale abbreviations and their full names"
  []
  (for [locale (impl/available-locales)]
    [locale (.getDisplayName (Locale/forLanguageTag locale))]))

(defn translate-system-locale
  "Translate a string with the System locale."
  [msg & args]
  (apply translate (system-locale) msg args))

(defn translate-user-locale
  "Translate a string with the current User's locale."
  [msg & args]
  (apply translate (user-locale) msg args))

(p.types/defrecord+ UserLocalizedString [msg args]
  Object
  (toString [_]
    (apply translate-user-locale msg args))
  schema.core.Schema
  (explain [this]
    (str this)))

(p.types/defrecord+ SystemLocalizedString [msg args]
  Object
  (toString [_]
    (apply translate-system-locale msg args))
  s/Schema
  (explain [this]
    (str this)))

(defn- localized-to-json
  "Write a UserLocalizedString or SystemLocalizedString to the `json-generator`. This is intended for
  `json-gen/add-encoder`. Ideallys we'd implement those protocols directly as it's faster, but currently that doesn't
  work with Cheshire"
  [localized-string json-generator]
  (json-gen/write-string json-generator (str localized-string)))

(json-gen/add-encoder UserLocalizedString localized-to-json)
(json-gen/add-encoder SystemLocalizedString localized-to-json)

(def LocalizedString
  "Schema for user and system localized string instances"
  (s/cond-pre UserLocalizedString SystemLocalizedString))

(defn- validate-number-of-args
  "Make sure the right number of args were passed to `trs`/`tru` and related forms during macro expansion."
  [msg args]
  (assert (string? msg)
    "The first arg to (deferred-)trs/tru must be a String! `gettext` does not eval Clojure files.")
  (let [message-format    (MessageFormat. msg)
        expected-num-args (count (.getFormats message-format))
        actual-num-args   (count args)]
    (assert (= expected-num-args actual-num-args)
      (format (str "(deferred-)trs/tru with format string \"%s\" expects %d args, got %d. "
                   "Did you forget to escape a single quote?")
              (.toPattern message-format) expected-num-args actual-num-args))))

(defmacro deferred-tru
  "Similar to `tru` but creates a `UserLocalizedString` instance so that conversion to the correct locale can be delayed
  until it is needed. The user locale comes from the browser, so conversion to the localized string needs to be 'late
  bound' and only occur when the user's locale is in scope. Calling `str` on the results of this invocation will
  lookup the translated version of the string."
  [msg & args]
  (validate-number-of-args msg args)
  `(UserLocalizedString. ~msg ~(vec args)))

(defmacro deferred-trs
  "Similar to `trs` but creates a `SystemLocalizedString` instance so that conversion to the correct locale can be
  delayed until it is needed. This is needed as the system locale from the JVM can be overridden/changed by a setting.
  Calling `str` on the results of this invocation will lookup the translated version of the string."
  [msg & args]
  (validate-number-of-args msg args)
  `(SystemLocalizedString. ~msg ~(vec args)))

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
  [msg & args]
  `(str* (deferred-tru ~msg ~@args)))

(defmacro trs
  "Applies `str` to `deferred-trs`'s expansion.
  Prefer this over `deferred-trs`. Use `deferred-trs` only in code executed at compile time, or where `str` is manually
  applied to the result."
  [msg & args]
  `(str* (deferred-trs ~msg ~@args)))

;; TODO - I seriously doubt whether these are still actually needed now that `tru` and `trs` generate forms wrapped in
;; `str` by default
(defn localized-string?
  "Returns true if `x` is a system or user localized string instance"
  [x]
  (some? #(instance? % x) [UserLocalizedString SystemLocalizedString]))

(defn localized-strings->strings
  "Walks the datastructure `x` and converts any localized strings to regular string"
  [x]
  (walk/postwalk (fn [node]
                   (cond-> node
                     (localized-string? node) str))
                 x))
