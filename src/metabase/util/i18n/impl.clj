(ns metabase.util.i18n.impl
  "Lower-level implementation functions for `metabase.util.i18n`. Most of this is not meant to be used directly; use the
  functions and macros in `metabase.util.i18n` instead."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.tools.reader.edn :as edn]
   [metabase.plugins.classloader :as classloader]
   [metabase.util.i18n.plural :as i18n.plural]
   [metabase.util.log :as log]
   [potemkin.types :as p.types])
  (:import
   (java.text MessageFormat)
   (java.util Locale)
   (org.apache.commons.lang3 LocaleUtils)))

(set! *warn-on-reflection* true)

(p.types/defprotocol+ CoerceToLocale
  "Protocol for anything that can be coerced to a `java.util.Locale`."
  (locale ^java.util.Locale [this]
    "Coerce `this` to a `java.util.Locale`."))

(defn normalized-locale-string
  "Normalize a locale string to the canonical format.

    (normalized-locale-string \"EN-US\") ;-> \"en_US\"

  Returns `nil` for invalid strings -- you can use this to check whether a String is valid."
  ^String [s]
  {:pre [((some-fn nil? string?) s)]}
  #_{:clj-kondo/ignore [:discouraged-var]}
  (when (string? s)
    (when-let [[_ language country] (re-matches #"^(\w{2})(?:[-_](\w{2}))?$" s)]
      (let [language (str/lower-case language)]
        (if country
          (str language \_ (some-> country str/upper-case))
          language)))))

(extend-protocol CoerceToLocale
  nil
  (locale [_] nil)

  Locale
  (locale [this] this)

  String
  (locale [^String s]
    (some-> (normalized-locale-string s) LocaleUtils/toLocale))

  ;; Support namespaced keywords like `:en/US` and `:en/UK` because we can
  clojure.lang.Keyword
  (locale [this]
    (locale (if-let [namespce (namespace this)]
              (str namespce \_ (name this))
              (name this)))))

(defn available-locale?
  "True if `locale` (a string, keyword, or `Locale`) is a valid locale available on this system. Normalizes args
  automatically."
  [locale-or-name]
  (boolean
   (when-let [locale (locale locale-or-name)]
     (LocaleUtils/isAvailableLocale locale))))

(defn- available-locale-names*
  []
  (log/info "Reading available locales from locales.clj...")
  (some-> (io/resource "locales.clj") slurp edn/read-string :locales (->> (apply sorted-set))))

(def ^{:arglists '([])} available-locale-names
  "Return sorted set of available locales, as Strings.

    (available-locale-names) ; -> #{\"en\" \"nl\" \"pt-BR\" \"zh\"}"
  (let [locales (delay (available-locale-names*))]
    (fn [] @locales)))

(defn- find-fallback-locale*
  ^Locale [^Locale a-locale]
  (some (fn [locale-name]
          (let [try-locale (locale locale-name)]
            ;; The language-only Locale is tried first by virtue of the
            ;; list being sorted.
            (when (and (= (.getLanguage try-locale) (.getLanguage a-locale))
                       (not (= try-locale a-locale)))
              try-locale)))
        (available-locale-names)))

(def ^:private ^{:arglists '([a-locale])} find-fallback-locale
  (memoize find-fallback-locale*))

(defn fallback-locale
  "Find a translated fallback Locale in the following order:
    1) If it is a language + country Locale, try the language-only Locale
    2) If the language-only Locale isn't translated or the input is a language-only Locale,
       find the first language + country Locale we have a translation for.
   Return `nil` if no fallback Locale can be found or the input is invalid.

    (fallback-locale \"en_US\") ; -> #locale\"en\"
    (fallback-locale \"pt\")    ; -> #locale\"pt_BR\"
    (fallback-locale \"pt_PT\") ; -> #locale\"pt_BR\""
  ^Locale [locale-or-name]
  (when-let [a-locale (locale locale-or-name)]
    (find-fallback-locale a-locale)))

(defn- locale-edn-resource
  "The resource URL for the edn file containing translations for `locale-or-name`. These files are built by the
  scripts in `bin/i18n` from `.po` files from POEditor.

    (locale-edn-resources \"es\") ;-> #object[java.net.URL \"file:/home/cam/metabase/resources/metabase/es.edn\"]"
  ^java.net.URL [locale-or-name]
  (when-let [a-locale (locale locale-or-name)]
    (let [locale-name (-> (normalized-locale-string (str a-locale))
                          (str/replace #"_" "-"))
          filename    (format "i18n/%s.edn" locale-name)]
      (io/resource filename (classloader/the-classloader)))))

(defn- translations* [a-locale]
  (when-let [resource (locale-edn-resource a-locale)]
    (edn/read-string (slurp resource))))

(def ^:private ^{:arglists '([locale-or-name])} translations
  "Fetch a map of original untranslated message format string -> translated message format string for `locale-or-name`
  by reading the corresponding EDN resource file. Does not include translations for parent locale(s). Memoized.

    (translations \"es\") ;-> {:headers  { ... }
                               :messages {\"Username\" \"Nombre Usuario\", ...}}"
  (comp (memoize translations*) locale))

(defn- translated-format-string*
  "Find the translated version of `format-string` for `locale-or-name`, or `nil` if none can be found.
  Does not search 'parent' (language-only) translations.

  `n` is a number used for translations with plural forms, used to compute the index of the translation to
  return."
  ^String [locale-or-name format-string n]
  (when (seq format-string)
    (when-let [locale (locale locale-or-name)]
      (when-let [translations (translations locale)]
        (when-let [string-or-strings (get-in translations [:messages format-string])]
          (if (string? string-or-strings)
            ;; Only a singular form defined; ignore `n`
            string-or-strings
            (if-let [plural-forms-header (get-in translations [:headers "Plural-Forms"])]
              (get string-or-strings (i18n.plural/index plural-forms-header n))
              ;; Fall-back to singular if no header is present
              (first string-or-strings))))))))

(defn- translated-format-string
  "Find the translated version of `format-string` for `locale-or-name`, or `nil` if none can be found. Searches parent
  (language-only) translations if none exist for a language + country locale."
  ^String [locale-or-name format-string {:keys [n format-string-pl]}]
  (when-let [a-locale (locale locale-or-name)]
    (or (when (= (.getLanguage a-locale) "en")
          (if (or (nil? n) (= n 1))
            format-string
            format-string-pl))
        (translated-format-string* a-locale format-string n)
        (when-let [fallback-locale (fallback-locale a-locale)]
          (log/tracef "No translated string found, trying fallback locale %s" (pr-str fallback-locale))
          (translated-format-string* fallback-locale format-string n))
        format-string)))

(defn- message-format ^MessageFormat [locale-or-name ^String format-string pluralization-opts]
  (or (when-let [a-locale (locale locale-or-name)]
        (when-let [^String translated (translated-format-string a-locale format-string pluralization-opts)]
          (MessageFormat. translated a-locale)))
      (MessageFormat. format-string)))

(defn translate
  "Find the translated version of `format-string` for a `locale-or-name`, then format it. Translates using the resource
  bundles generated by the `./bin/i18n/build-translation-resources` script; these live in
  `./resources/metabase/Metabase/Messages_<locale>.class`. Attempts to translate with `language-country` Locale if
  specified, falling back to `language` (without country), finally falling back to English (i.e., not formatting the
  original untranslated `format-string`) if no matching bundles/translations exist, or if translation fails for some
  other reason.

  `n` is used for strings with plural forms and essentially represents the quantity of items being described by the
  translated string. Defaults to 1 (the singular form).

  Will attempt to translate `format-string`, but if for some reason we're not able to (such as a typo in the
  translated version of the string), log the failure but return the original (untranslated) string. This is a
  workaround for translations that, due to a typo, will fail to parse using Java's message formatter.

    (translate \"es-MX\" \"must be {0} characters or less\" 140) ; -> \"deben tener 140 caracteres o menos\""
  ([locale-or-name ^String format-string]
   (translate locale-or-name format-string []))

  ([locale-or-name ^String format-string args]
   (translate locale-or-name format-string args {}))

  ([locale-or-name ^String format-string args pluralization-opts]
   (when (seq format-string)
     (try
       (.format (message-format locale-or-name format-string pluralization-opts) (to-array args))
       (catch Throwable e
         ;; Not translating this string to prevent an unfortunate stack overflow. If this string happened to be the one
         ;; that had the typo, we'd just recur endlessly without logging an error.
         (log/errorf e "Unable to translate string %s to %s" (pr-str format-string) (str locale-or-name))
         (try
           (.format (MessageFormat. format-string) (to-array args))
           (catch Throwable _
             (log/errorf e "Invalid format string %s" (pr-str format-string))
             format-string)))))))

(def ^:private ^:dynamic *in-site-locale-from-setting*
  "Whether we're currently inside a call to [[site-locale-from-setting]], so we can prevent infinite recursion."
  false)

(defn site-locale-from-setting
  "Fetch the value of the `site-locale` Setting, or `nil` if it is unset."
  []
  (when-let [get-value-of-type (resolve 'metabase.models.setting/get-value-of-type)]
    (when (bound? get-value-of-type)
      ;; make sure we don't try to recursively fetch the site locale when we're actively in the process of fetching it,
      ;; otherwise that will cause infinite loops if we try to log anything... see #32376
      (when-not *in-site-locale-from-setting*
        (binding [*in-site-locale-from-setting* true]
          ;; if there is an error fetching the Setting, e.g. if the app DB is in the process of shutting down, then just
          ;; return nil.
          (try
            (get-value-of-type :string :site-locale)
            (catch Exception _
              nil)))))))

(defmethod print-method Locale
  [locale ^java.io.Writer writer]
  ((get-method print-dup Locale) locale writer))

(defmethod print-dup Locale
  [locale ^java.io.Writer writer]
  (.write writer (format "#locale %s" (pr-str (str locale)))))
