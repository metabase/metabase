(ns metabase.util.i18n-be.core
  "Backend-only (JVM) i18n functionality: locale handling, JSON encoders for
  localized strings, and re-exports of [[metabase.util.i18n-be.macros]] so
  existing callers can keep referring to everything through a single namespace.

  The light pieces (records, deferred/eager macros, the `localized-string?`
  predicate, validation helpers) live in [[metabase.util.i18n-be.macros]] to
  keep them off shadow-cljs's macro-load path — see that namespace's docstring
  for the rationale."
  (:require
   [metabase.util.i18n-be.macros :as i18n-be.macros]
   [metabase.util.i18n.common :as i18n.common]
   [metabase.util.i18n.impl :as i18n.impl]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [potemkin :as p])
  (:import
   (java.util Locale)
   (metabase.util.i18n_be.macros UserLocalizedString SiteLocalizedString)))

(set! *warn-on-reflection* true)

;; Dynamic vars defined here (not in `i18n-be.macros`) so `binding` works
;; correctly through any imported alias. Potemkin's `import-vars` would
;; create a distinct Var with the same root value; `binding` on the imported
;; Var would not affect the original — silently breaking per-thread overrides.
(def ^:dynamic *user-locale*
  "Bind this to a string, keyword, or `Locale` to set the locale for the current User. To get the locale we should
  *use*, use the `user-locale` function instead."
  nil)

(def ^:dynamic *site-locale-override*
  "Bind this to a string, keyword to override the value returned by `site-locale`. For testing purposes,
  such as when swapping out an application database temporarily, when the setting table may not even exist."
  nil)

(p/import-vars
 [i18n.common
  join-strings-with-conjunction]
 [i18n.impl
  available-locale?
  fallback-locale
  locale
  normalized-locale-string
  translate]
 [i18n-be.macros
  ->SiteLocalizedString
  ->UserLocalizedString
  LocalizedString
  deferred-tru
  deferred-trs
  deferred-trun
  deferred-trsn
  localized-string?
  localized-strings->strings
  map->SiteLocalizedString
  map->UserLocalizedString
  str*
  tru-clj
  trs-clj
  trun-clj
  trsn-clj
  validate-number-of-args
  validate-n])

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

(def ^:private test-only-locales
  "Locales that are hidden from language pickers unless `MB_ENABLE_TEST_LOCALES=true`.
  Currently just the `en_ZZ` pseudo-locale. See UXW-3460."
  #{"en_ZZ"})

(def ^:private locale-display-name-overrides
  "Custom display names for locales whose JVM default is confusing. The JVM renders `en_ZZ` as
  \"English (Unknown Region)\" because it has no CLDR data for the user-assigned region code `ZZ`. We override it to
  \"English (ZZ)\" which is clearer for developers choosing it in the language picker."
  {"en_ZZ" "English (ZZ)"})

(defn- show-test-locales?
  "Whether test-only pseudo-locales like `en_ZZ` should appear in language pickers.
  True when the `MB_ENABLE_TEST_LOCALES` env var is explicitly set to `\"true\"`
  (e.g. by the Cypress runner or local dev environment)."
  []
  (= "true" (System/getenv "MB_ENABLE_TEST_LOCALES")))

(defn available-locales-with-names
  "Returns all locale abbreviations and their full names"
  []
  (let [show-test? (show-test-locales?)]
    (for [locale-name (i18n.impl/available-locale-names)
          :let [normalized (normalized-locale-string locale-name)]
          :when (or show-test?
                    (not (contains? test-only-locales normalized)))]
      [normalized (get locale-display-name-overrides normalized (.getDisplayName (locale locale-name)))])))

(def ^:private included-locales
  (delay (set (map normalized-locale-string (i18n.impl/available-locale-names)))))

(defn included-locale?
  "Returns true is this is a locale included in locales.clj instead of just one available on the JVM."
  [locale]
  (contains? @included-locales locale))

(defn translate-site-locale
  "Translate a string with the System locale.

  Public so [[metabase.util.i18n-be.macros]]'s record `toString` methods can
  reach it via `requiring-resolve` without triggering a circular dependency."
  [format-string args pluralization-opts]
  (let [translated (translate (site-locale) format-string args pluralization-opts)]
    (log/tracef "Translated %s for site locale %s -> %s"
                (pr-str format-string) (pr-str (site-locale-string)) (pr-str translated))
    translated))

(defn translate-user-locale
  "Translate a string with the current User's locale.

  Public for the same reason as [[translate-site-locale]]."
  [format-string args pluralization-opts]
  (let [translated (translate (user-locale) format-string args pluralization-opts)]
    (log/tracef "Translating %s for user locale %s (site locale %s) -> %s"
                (pr-str format-string) (pr-str (user-locale-string))
                (pr-str (site-locale-string)) (pr-str translated))
    translated))

(defn- localized-to-json
  "Write a UserLocalizedString or SiteLocalizedString to the `json-generator`. This is intended for
  `json/add-encoder`. Ideally we'd implement those protocols directly as it's faster, but currently that doesn't
  work with Cheshire"
  [localized-string json-generator]
  (json/write-string json-generator (str localized-string)))

(json/add-encoder UserLocalizedString localized-to-json)
(json/add-encoder SiteLocalizedString localized-to-json)
