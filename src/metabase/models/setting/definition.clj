(ns metabase.models.setting.definition
  "Common code related to dealing with Setting definitions."
  (:require
   [clojure.string :as str]))

(defprotocol ^:private SettingName
  (setting-name ^String [setting-definition-or-name]
    "String name of a Setting, e.g. `\"site-url\"`. Works with strings, keywords, or Setting definition maps."))

(extend-protocol SettingName
  clojure.lang.IPersistentMap
  (setting-name [this]
    (name (:name this)))

  String
  (setting-name [this]
    this)

  clojure.lang.Keyword
  (setting-name [this]
    (name this)))

(defn allows-site-wide-values?
  "Whether this is a 'normal' Setting that allows site-wide values, as opposed to a database-local-only Setting or a
  user-local-only Setting."
  [setting-def]
  (and
   (not= (:database-local setting-def) :only)
   (not= (:user-local setting-def) :only)))

(defn allows-database-local-values?
  "Whether this Setting allows setting values for individual data warehouse databases."
  [setting-def]
  (#{:only :allowed} (:database-local setting-def)))

(defn allows-user-local-values?
  "Whether this Setting allows setting values for individual Users."
  [setting-def]
  (#{:only :allowed} (:user-local setting-def)))

(defn munge-setting-name
  "Munge names so that they are legal for bash. Only allows for alphanumeric characters,  underscores, and hyphens."
  [setting-nm]
  (str/replace (name setting-nm) #"[^a-zA-Z0-9_-]*" ""))

(defn env-var-name
  "Get the env var corresponding to `setting-definition-or-name`. (This is used primarily for documentation purposes)."
  ^String [setting-definition-or-name]
  (str "MB_" (-> (setting-name setting-definition-or-name)
                 munge-setting-name
                 (str/replace "-" "_")
                 str/upper-case)))
