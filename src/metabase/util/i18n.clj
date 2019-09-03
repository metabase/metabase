(ns metabase.util.i18n
  (:refer-clojure :exclude [ex-info])
  (:require [cheshire.generate :as json-gen]
            [clojure.tools.logging :as log]
            [clojure.walk :as walk]
            [potemkin.types :as p.types]
            [puppetlabs.i18n.core :as i18n :refer [available-locales]]
            [schema.core :as s])
  (:import java.util.Locale))

(defn available-locales-with-names
  "Returns all locale abbreviations and their full names"
  []
  (map (fn [locale] [locale (.getDisplayName (Locale/forLanguageTag locale))]) (available-locales)))

(defn set-locale
  "This sets the local for the instance"
  [locale]
  (Locale/setDefault (Locale/forLanguageTag locale)))

(defn- translate
  "A failsafe version of `i18n/translate`. Will attempt to translate `msg` but if for some reason we're not able
  to (such as a typo in the translated version of the string), log the failure but return the original (untranslated)
  string. This is a workaround for translations that, due to a typo, will fail to parse using Java's message
  formatter."
  [locale ns-str msg args]
  (try
    (apply i18n/translate ns-str (locale) msg args)
    (catch IllegalArgumentException e
      ;; Not translating this string to prevent an unfortunate stack overflow. If this string happened to be the one
      ;; that had the typo, we'd just recur endlessly without logging an error.
      (log/errorf e "Unable to translate string '%s'" msg)
      msg)))

(def ^:private translate-system-locale
  (partial translate i18n/system-locale))

(def ^:private translate-user-locale
  (partial translate i18n/user-locale))

(p.types/defrecord+ UserLocalizedString [ns-str msg args]
  Object
  (toString [_]
    (translate-user-locale ns-str msg args))
  schema.core.Schema
  (explain [this]
    (str this)))

(p.types/defrecord+ SystemLocalizedString [ns-str msg args]
  Object
  (toString [_]
    (translate-system-locale ns-str msg args))
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

(defmacro deferred-tru
  "Similar to `puppetlabs.i18n.core/tru` but creates a `UserLocalizedString` instance so that conversion to the
  correct locale can be delayed until it is needed. The user locale comes from the browser, so conversion to the
  localized string needs to be 'late bound' and only occur when the user's locale is in scope. Calling `str` on the
  results of this invocation will lookup the translated version of the string."
  [msg & args]
  `(UserLocalizedString. ~(namespace-munge *ns*) ~msg ~(vec args)))

(defmacro deferred-trs
  "Similar to `puppetlabs.i18n.core/trs` but creates a `SystemLocalizedString` instance so that conversion to the
  correct locale can be delayed until it is needed. This is needed as the system locale from the JVM can be
  overridden/changed by a setting. Calling `str` on the results of this invocation will lookup the translated version
  of the string."
  [msg & args]
  `(SystemLocalizedString. ~(namespace-munge *ns*) ~msg ~(vec args)))

(def ^String str*
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

(def ^:private localized-string-checker
  "Compiled checker for `LocalizedString`s which is more efficient when used repeatedly like in `localized-string?`
  below"
  (s/checker LocalizedString))

(defn localized-string?
  "Returns `true` if `maybe-a-localized-string` is a system or user localized string instance"
  [maybe-a-localized-string]
  (not (localized-string-checker maybe-a-localized-string)))

(defn localized-strings->strings
  "Walks the datastructure `x` and converts any localized strings to regular string"
  [x]
  (walk/postwalk (fn [node]
                   (if (localized-string? node)
                     (str node)
                     node)) x))

(defn ^:deprecated ex-info
  "Just like `clojure.core/ex-info` but it is i18n-aware. It will call `str` on `msg` and walk `ex-data` converting any
  `SystemLocalizedString` and `UserLocalizedString`s to a regular string"
  ([msg ex-data-map]
   (clojure.core/ex-info (str msg) (localized-strings->strings ex-data-map)))
  ([msg ex-data-map cause]
   (clojure.core/ex-info (str msg) (localized-strings->strings ex-data-map) cause)))
