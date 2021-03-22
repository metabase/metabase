(ns metabase.util.i18n.impl
  "Lower-level implementation functions for `metabase.util.i18n`. Most of this is not meant to be used directly; use the
  functions and macros in `metabase.util.i18n` instead."
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [clojure.tools.reader.edn :as edn]
            [metabase.plugins.classloader :as classloader]
            [potemkin.types :as p.types])
  (:import java.text.MessageFormat
           java.util.Locale
           org.apache.commons.lang3.LocaleUtils))

(p.types/defprotocol+ CoerceToLocale
  "Protocol for anything that can be coerced to a `java.util.Locale`."
  (locale ^java.util.Locale [this]
    "Coerce `this` to a `java.util.Locale`."))

(defn normalized-locale-string
  "Normalize a locale string to the canonical format.

    (normalized-locale-string \"EN-US\") ;-> \"en_US\"

  Returns `nil` for invalid strings -- you can use this to check whether a String is valid."
  [s]
  {:pre [((some-fn nil? string?) s)]}
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
    (LocaleUtils/toLocale (normalized-locale-string s)))

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

(defn parent-locale
  "For langugage + country Locales, returns the language-only Locale. Otherwise returns `nil`.

    (parent-locale \"en/US\") ; -> #object[java.util.Locale 0x79301688 \"en\"]"
  ^Locale [locale-or-name]
  (when-let [a-locale (locale locale-or-name)]
    (when (seq (.getCountry a-locale))
      (locale (.getLanguage a-locale)))))

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

    (translations \"es\") ;-> {\"Username\" \"Nombre Usuario\", ...}"
  (comp (memoize translations*) locale))

(defn- translated-format-string*
  "Find the translated version of `format-string` for `locale-or-name`, or `nil` if none can be found.
  Does not search 'parent' (language-only) translations."
  ^String [locale-or-name format-string]
  (when (seq format-string)
    (when-let [locale (locale locale-or-name)]
      (when-let [translations (translations locale)]
        (get translations format-string)))))

(defn- translated-format-string
  "Find the translated version of `format-string` for `locale-or-name`, or `nil` if none can be found. Searches parent
  (language-only) translations if none exist for a language + country locale."
  ^String [locale-or-name format-string]
  (when-let [a-locale (locale locale-or-name)]
    (or (when (= (.getLanguage a-locale) "en")
          format-string)
        (translated-format-string* a-locale format-string)
        (when-let [parent-locale (parent-locale a-locale)]
          (log/tracef "No translated string found, trying parent locale %s" (pr-str parent-locale))
          (translated-format-string* parent-locale format-string))
        format-string)))

(defn- message-format ^MessageFormat [locale-or-name ^String format-string]
  (or (when-let [a-locale (locale locale-or-name)]
        (when-let [^String translated (translated-format-string a-locale format-string)]
          (MessageFormat. translated a-locale)))
      (MessageFormat. format-string)))

(defn translate
  "Find the translated version of `format-string` for a `locale-or-name`, then format it. Translates using the resource
  bundles generated by the `./bin/i18n/build-translation-resources` script; these live in
  `./resources/metabase/Metabase/Messages_<locale>.class`. Attempts to translate with `language-country` Locale if
  specified, falling back to `language` (without country), finally falling back to English (i.e., not formatting the
  original untranslated `format-string`) if no matching bundles/translations exist, or if translation fails for some
  other reason.

  Will attempt to translate `format-string`, but if for some reason we're not able to (such as a typo in the
  translated version of the string), log the failure but return the original (untranslated) string. This is a
  workaround for translations that, due to a typo, will fail to parse using Java's message formatter.

    (translate \"es-MX\" \"must be {0} characters or less\" 140) ; -> \"deben tener 140 caracteres o menos\""
  [locale-or-name ^String format-string & args]
  (when (seq format-string)
    (try
      (.format (message-format locale-or-name format-string) (to-array args))
      (catch Throwable e
        ;; Not translating this string to prevent an unfortunate stack overflow. If this string happened to be the one
        ;; that had the typo, we'd just recur endlessly without logging an error.
        (log/errorf e "Unable to translate string %s to %s" (pr-str format-string) (str locale-or-name))
        (try
          (.format (MessageFormat. format-string) (to-array args))
          (catch Throwable _
            (log/errorf e "Invalid format string %s" (pr-str format-string))
            format-string))))))

(defn- available-locale-names*
  []
  (log/info "Reading available locales from locales.clj...")
  (some-> (io/resource "locales.clj") slurp edn/read-string :locales set))

(def ^{:arglists '([])} available-locale-names
  "Return set of available locales, as Strings.

    (available-locale-names) ; -> #{\"nl\" \"pt\" \"en\" \"zh\"}"
  (let [locales (delay (available-locale-names*))]
    (fn [] @locales)))

;; We can't fetch the system locale until the application DB has been initiailized. Once that's done, we don't need to
;; do the check anymore -- swapping out the getter fn with the simpler one speeds things up substantially
(def ^:private site-locale-from-setting-fn
  (atom
   (fn []
     (when-let [db-is-set-up? (resolve 'metabase.db/db-is-set-up?)]
       (when (and (bound? db-is-set-up?)
                  (db-is-set-up?))
         (when-let [get-string (resolve 'metabase.models.setting/get-string)]
           (when (bound? get-string)
             (let [f (fn [] (get-string :site-locale))]
               (reset! site-locale-from-setting-fn f)
               (f)))))))))

(defn site-locale-from-setting
  "Fetch the value of the `site-locale` Setting."
  []
  (@site-locale-from-setting-fn))

(defmethod print-method Locale
  [locale ^java.io.Writer writer]
  ((get-method print-dup Locale) locale writer))

(defmethod print-dup Locale
  [locale ^java.io.Writer writer]
  (.write writer (format "#locale %s" (pr-str (str locale)))))
