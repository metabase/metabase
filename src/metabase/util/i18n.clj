(ns metabase.util.i18n
  "i18n functionality."
  (:require
   [cheshire.generate :as json.generate]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase.util.i18n.impl :as i18n.impl]
   [metabase.util.log :as log]
   [potemkin :as p]
   [potemkin.types :as p.types])
  (:import
   (java.text MessageFormat)
   (java.util Locale)))

(set! *warn-on-reflection* true)

(p/import-vars
 [i18n.impl
  available-locale?
  fallback-locale
  locale
  normalized-locale-string
  translate])

(def ^:dynamic *user-locale*
  "Bind this to a string, keyword, or `Locale` to set the locale for the current User. To get the locale we should
  *use*, use the `user-locale` function instead."
  nil)

(def ^:dynamic *site-locale-override*
  "Bind this to a string, keyword to override the value returned by `site-locale`. For testing purposes,
  such as when swapping out an application database temporarily, when the setting table may not even exist."
  nil)

(defn site-locale-string
  "The default locale string for this Metabase installation. Normally this is the value of the `site-locale` Setting,
  which is also a string."
  []
  (or *site-locale-override*
      (i18n.impl/site-locale-from-setting)
      "en"))

(defn user-locale-string
  "Locale string we should *use* for the current User (e.g. `tru` messages) -- `*user-locale*` if bound, otherwise the
  system locale as a string."
  []
  (or *user-locale*
      (site-locale-string)))

(defn site-locale
  "The default locale for this Metabase installation. Normally this is the value of the `site-locale` Setting."
  ^Locale []
  (locale (site-locale-string)))

(defn user-locale
  "Locale we should *use* for the current User (e.g. `tru` messages) -- `*user-locale*` if bound, otherwise the system
  locale."
  ^Locale []
  (locale (user-locale-string)))

(defn available-locales-with-names
  "Returns all locale abbreviations and their full names"
  []
  (for [locale-name (i18n.impl/available-locale-names)]
    ;; Abbreviation must be normalized or the language picker will show incorrect saved value
    ;; because the locale is normalized before saving (metabase#15657, metabase#16654)
    [(normalized-locale-string locale-name) (.getDisplayName (locale locale-name))]))

(defn- translate-site-locale
  "Translate a string with the System locale."
  [format-string args pluralization-opts]
  (let [translated (translate (site-locale) format-string args pluralization-opts)]
    (log/tracef "Translated %s for site locale %s -> %s"
                (pr-str format-string) (pr-str (site-locale-string)) (pr-str translated))
    translated))

(defn- translate-user-locale
  "Translate a string with the current User's locale."
  [format-string args pluralization-opts]
  (let [translated (translate (user-locale) format-string args pluralization-opts)]
    (log/tracef "Translating %s for user locale %s (site locale %s) -> %s"
                (pr-str format-string) (pr-str (user-locale-string))
                (pr-str (site-locale-string)) (pr-str translated))
    translated))

(p.types/defrecord+ UserLocalizedString [format-string args pluralization-opts]
  Object
  (toString [_]
    (translate-user-locale format-string args pluralization-opts)))

(p.types/defrecord+ SiteLocalizedString [format-string args pluralization-opts]
  Object
  (toString [_]
    (translate-site-locale format-string args pluralization-opts)))

(defn- localized-to-json
  "Write a UserLocalizedString or SiteLocalizedString to the `json-generator`. This is intended for
  `json.generate/add-encoder`. Ideally we'd implement those protocols directly as it's faster, but currently that doesn't
  work with Cheshire"
  [localized-string json-generator]
  (json.generate/write-string json-generator (str localized-string)))

(json.generate/add-encoder UserLocalizedString localized-to-json)
(json.generate/add-encoder SiteLocalizedString localized-to-json)

(def LocalizedString
  "Schema for user and system localized string instances"
  (letfn [(instance-of [^Class klass]
            [:fn
             {:error/message (str "instance of " (.getCanonicalName klass))}
             (partial instance? klass)])]
    [:or
     (instance-of UserLocalizedString)
     (instance-of SiteLocalizedString)]))

(defn- valid-str-form?
 [str-form]
 (and
  (= (first str-form) 'str)
  (every? string? (rest str-form))))

(defn- validate-number-of-args
  "Make sure the right number of args were passed to `trs`/`tru` and related forms during macro expansion."
  [format-string-or-str args]
  (let [format-string              (cond
                                     (string? format-string-or-str) format-string-or-str
                                     (valid-str-form? format-string-or-str) (apply str (rest format-string-or-str))
                                     :else (assert false "The first arg to (deferred-)trs/tru must be a String or a valid `str` form with String arguments!"))
        message-format             (MessageFormat. format-string)
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
  bound' and only occur when the user's locale is in scope.

  The first argument can be a format string, or a valid `str` form with all string arguments. The latter can be used to
  split a long string over multiple lines.

  Calling `str` on the results of this invocation will lookup the translated version of the string."
  [format-string-or-str & args]
  (validate-number-of-args format-string-or-str args)
  `(UserLocalizedString. ~format-string-or-str ~(vec args) {}))

(defmacro deferred-trs
  "Similar to `trs` but creates a `SiteLocalizedString` instance so that conversion to the correct locale can be
  delayed until it is needed. This is needed as the system locale from the JVM can be overridden/changed by a setting.

  The first argument can be a format string, or a valid `str` form with all string arguments. The latter can be used to
  split a long string over multiple lines.

  Calling `str` on the results of this invocation will lookup the translated version of the string."
  [format-string & args]
  (validate-number-of-args format-string args)
  `(SiteLocalizedString. ~format-string ~(vec args) {}))

(def ^String ^{:arglists '([& args])} str*
  "Ensures that `trs`/`tru` isn't called prematurely, during compilation."
  (if *compile-files*
    (fn [& _]
      (throw (Exception. "Premature i18n string lookup. Is there a top-level call to `trs` or `tru`?")))
    str))

(defmacro tru
  "Applies `str` to `deferred-tru`'s expansion.

  The first argument can be a format string, or a valid `str` form with all string arguments. The latter can be used to
  split a long string over multiple lines.

  Prefer this over `deferred-tru`. Use `deferred-tru` only in code executed at compile time, or where `str` is manually
  applied to the result."
  {:style/indent [:form]}
  [format-string-or-str & args]
  `(str* (deferred-tru ~format-string-or-str ~@args)))

(defmacro trs
  "Applies `str` to `deferred-trs`'s expansion.

  The first argument can be a format string, or a valid `str` form with all string arguments. The latter can be used to
  split a long string over multiple lines.

  Prefer this over `deferred-trs`. Use `deferred-trs` only in code executed at compile time, or where `str` is manually
  applied to the result."
  {:style/indent [:form]}
  [format-string-or-str & args]
  `(str* (deferred-trs ~format-string-or-str ~@args)))

(defn- validate-n
  "Make sure that `trsn`/`trun` and related forms have valid format strings, with most one placeholder (for n)"
  [format-string format-string-pl]
  (assert (and (string? format-string) (string? format-string-pl))
          "The first and second args to (deferred-)trsn/trun must be Strings!")
  (let [validate (fn [format-string]
                   (let [message-format    (MessageFormat. format-string)
                         ;; number of {n} placeholders in format string including any you may have skipped. e.g. "{0} {2}" -> 3
                         num-args-by-index (count (.getFormatsByArgumentIndex message-format))
                         ;; number of {n} placeholders in format string *not* including ones you make have skipped. e.g. "{0} {2}" -> 2
                         num-args          (count (.getFormats message-format))]
                     (assert (and (<= num-args-by-index 1) (<= num-args 1))
                             (format "(deferred-)trsn/trun only supports a single {0} placeholder for the value `n`"))))]
    (validate format-string)
    (validate format-string-pl)))

(defmacro deferred-trun
  "Similar to `deferred-tru` but chooses the appropriate singular or plural form based on the value of `n`.

  The first argument should be the singular form; the second argument should be the plural form, and the third argument
  should be `n`. `n` can be interpolated into the translated string using the `{0}` placeholder syntax, but no
  additional placeholders are supported.

    (deferred-trun \"{0} table\" \"{0} tables\" n)"
  [format-string format-string-pl n]
  (validate-n format-string format-string-pl)
  `(UserLocalizedString. ~format-string ~[n] ~{:n n :format-string-pl format-string-pl}))

(defmacro trun
  "Similar to `tru` but chooses the appropriate singular or plural form based on the value of `n`.

  The first argument should be the singular form; the second argument should be the plural form, and the third argument
  should be `n`. `n` can be interpolated into the translated string using the `{0}` placeholder syntax, but no
  additional placeholders are supported.

    (trun \"{0} table\" \"{0} tables\" n)"
  [format-string format-string-pl n]
  `(str* (deferred-trun ~format-string ~format-string-pl ~n)))

(defmacro deferred-trsn
  "Similar to `deferred-trs` but chooses the appropriate singular or plural form based on the value of `n`.

  The first argument should be the singular form; the second argument should be the plural form, and the third argument
  should be `n`. `n` can be interpolated into the translated string using the `{0}` placeholder syntax, but no
  additional placeholders are supported.

    (deferred-trsn \"{0} table\" \"{0} tables\" n)"
  [format-string format-string-pl n]
  (validate-n format-string format-string-pl)
  `(SiteLocalizedString. ~format-string ~[n] ~{:n n :format-string-pl format-string-pl}))

(defmacro trsn
  "Similar to `trs` but chooses the appropriate singular or plural form based on the value of `n`.

  The first argument should be the singular form; the second argument should be the plural form, and the third argument
  should be `n`. `n` can be interpolated into the translated string using the `{0}` placeholder syntax, but no
  additional placeholders are supported.

    (trsn \"{0} table\" \"{0} tables\" n)"
  [format-string format-string-pl n]
  `(str* (deferred-trsn ~format-string ~format-string-pl ~n)))

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
