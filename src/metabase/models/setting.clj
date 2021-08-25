(ns metabase.models.setting
  "Settings are a fast and simple way to create a setting that can be set from the admin page. They are saved to the
   Database, but intelligently cached internally for super-fast lookups.

   Define a new Setting with `defsetting` (optionally supplying a default value, type, or custom getters & setters):

      (defsetting mandrill-api-key \"API key for Mandrill\")

   The setting and docstr will then be auto-magically accessible from the admin page.

   You can also set the value via the corresponding env var, which looks like `MB_MANDRILL_API_KEY`, where the name of
   the setting is converted to uppercase and dashes to underscores.

   The var created with `defsetting` can be used as a getter/setter, or you can use `get` and `set!`:

       (require '[metabase.models.setting :as setting])

       (setting/get :mandrill-api-key)           ; only returns values set explicitly from the Admin Panel
       (mandrill-api-key)                        ; returns value set in the Admin Panel, OR value of corresponding env var,
                                                 ; OR the default value, if any (in that order)

       (setting/set! :mandrill-api-key \"NEW_KEY\")
       (mandrill-api-key \"NEW_KEY\")

       (setting/set! :mandrill-api-key nil)
       (mandrill-api-key nil)

   Get a map of all Settings:

      (setting/all)"
  (:refer-clojure :exclude [get])
  (:require [cheshire.core :as json]
            [clojure.core :as core]
            [clojure.data :as data]
            [clojure.data.csv :as csv]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [environ.core :as env]
            [medley.core :as m]
            [metabase.events :as events]
            [metabase.models.setting.cache :as cache]
            [metabase.util :as u]
            [metabase.util.date-2 :as u.date]
            [metabase.util.i18n :as ui18n :refer [deferred-trs deferred-tru trs tru]]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.models :as models])
  (:import [clojure.lang Keyword Symbol]
           java.io.StringWriter
           java.time.temporal.Temporal))

(models/defmodel Setting
  "The model that underlies `defsetting`."
  :setting)

(u/strict-extend (class Setting)
  models/IModel
  (merge models/IModelDefaults
         {:types (constantly {:value :encrypted-text})
          :primary-key (constantly :key)}))


(def ^:private Type
  (s/enum :string :boolean :json :integer :double :timestamp :csv :keyword))

(def ^:private Visibility
  (s/enum :public :authenticated :admin :internal))

(def ^:private default-tag-for-type
  "Type tag that will be included in the Setting's metadata, so that the getter function will not cause reflection
  warnings."
  {:string    `String
   :boolean   `Boolean
   :integer   `Long
   :double    `Double
   :timestamp `Temporal
   :keyword   `Keyword})

(defn- validate-default-value-for-type
  "Check whether the `:default` value of a Setting (if provided) agrees with the Setting's `:type` and its `:tag` (which
  usually comes from [[default-tag-for-type]])."
  [{setting-type :type, setting-name :name, :keys [tag default], :as setting-definition}]
  ;; the errors below don't need to be i18n'ed since they're definition-time errors rather than user-facing
  (when (some? tag)
    (assert ((some-fn symbol? string?) tag) (format "Setting :tag should be a symbol or string, got: ^%s %s"
                                                    (.getCanonicalName (class tag))
                                                    (pr-str tag))))
  (when (and (some? default)
             (some? tag))
    (let [klass (if (string? tag)
                  (try
                    (Class/forName tag)
                    (catch Throwable e
                      e))
                  (resolve tag))]
      (when-not (class? klass)
        (throw (ex-info (format "Cannot resolve :tag %s to a class. Is it fully qualified?" (pr-str tag))
                        {:tag klass}
                        (when (instance? Throwable klass) klass))))
      (when-not (instance? klass default)
        (throw (ex-info (format "Wrong :default type: got ^%s %s, but expected a %s"
                                (.getCanonicalName (class default))
                                (pr-str default)
                                (.getCanonicalName ^Class klass))
                        {:tag klass}))))))

(def ^:private SettingDefinition
  {:name        s/Keyword
   :munged-name s/Str
   :namespace   s/Symbol
   :description s/Any            ; description is validated via the macro, not schema
   :default     s/Any
   :type        Type             ; all values are stored in DB as Strings,
   :getter      clojure.lang.IFn ; different getters/setters take care of parsing/unparsing
   :setter      clojure.lang.IFn
   :tag         (s/maybe Symbol) ; type annotation, e.g. ^String, to be applied. Defaults to tag based on :type
   :sensitive?  s/Bool           ; is this sensitive (never show in plaintext), like a password? (default: false)
   :visibility  Visibility       ; where this setting should be visible (default: :admin)
   :cache?      s/Bool           ; should the getter always fetch this value "fresh" from the DB? (default: false)

  ;; called whenever setting value changes, whether from update-setting! or a cache refresh. used to handle cases
  ;; where a change to the cache necessitates a change to some value outside the cache, like when a change the
  ;; `:site-locale` setting requires a call to `java.util.Locale/setDefault`
   :on-change   (s/maybe clojure.lang.IFn)})


(defonce ^:private registered-settings
  (atom {}))

(defprotocol ^:private Resolvable
  (resolve-setting [setting-definition-or-name]
    "Resolve the definition map for a Setting. `setting-definition-or-name` map be a map, keyword, or string."))

(extend-protocol Resolvable
  clojure.lang.IPersistentMap
  (resolve-setting [this] this)

  String
  (resolve-setting [s]
    (resolve-setting (keyword s)))

  clojure.lang.Keyword
  (resolve-setting [k]
    (or (@registered-settings k)
        (throw (Exception.
                (tru "Setting {0} does not exist.\nFound: {1}" k (sort (keys @registered-settings))))))))

(defn- call-on-change
  "Cache watcher that applies `:on-change` callback for all settings that have changed."
  [_key _ref old new]
  (let [rs      @registered-settings
        [d1 d2] (data/diff old new)]
    (doseq [changed-setting (into (set (keys d1))
                                  (set (keys d2)))]
      (when-let [on-change (get-in rs [(keyword changed-setting) :on-change])]
        (on-change (clojure.core/get old changed-setting) (clojure.core/get new changed-setting))))))

(add-watch @#'cache/cache* :call-on-change call-on-change)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                      get                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

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

(defn- munge-setting-name
  "Munge names so that they are legal for bash. Only allows for alphanumeric characters,  underscores, and hyphens."
  [setting-nm]
  (str/replace (name setting-nm) #"[^a-zA-Z0-9_-]*" ""))

(defn- env-var-name
  "Get the env var corresponding to `setting-definition-or-name`. (This is used primarily for documentation purposes)."
  ^String [setting-definition-or-name]
  (str "MB_" (-> (setting-name setting-definition-or-name)
                 munge-setting-name
                 (str/replace "-" "_")
                 str/upper-case)))

(defn env-var-value
  "Get the value of `setting-definition-or-name` from the corresponding env var, if any.
   The name of the Setting is converted to uppercase and dashes to underscores; for example, a setting named
  `default-domain` can be set with the env var `MB_DEFAULT_DOMAIN`. Note that this strips out characters that are not
  legal for shells. Setting `foo-bar?` will expect to find the key `:mb-foo-bar` which will be sourced from the
  environment variable `MB_FOO_BAR`."
  ^String [setting-definition-or-name]
  (let [v (env/env (keyword (str "mb-" (munge-setting-name (setting-name setting-definition-or-name)))))]
    (when (seq v)
      v)))

(def ^:private ^:dynamic *disable-cache* false)

(defn- db-or-cache-value
  "Get the value, if any, of `setting-definition-or-name` from the DB (using / restoring the cache as needed)."
  ^String [setting-definition-or-name]
  (if *disable-cache*
    (db/select-one-field :value Setting :key (setting-name setting-definition-or-name))
    (do
      (cache/restore-cache-if-needed!)
      (clojure.core/get (cache/cache) (setting-name setting-definition-or-name)))))

(defn default-value
  "Get the `:default` value of `setting-definition-or-name` if one was specified. With optional arg `pred`, only returns
  default value if `(some-> default pred)` is truthy."
  ([setting-definition-or-name]
   (default-value setting-definition-or-name nil))
  ([setting-definition-or-name pred]
   (let [{:keys [default]} (resolve-setting setting-definition-or-name)]
     (if pred
       (when (some-> default pred)
         default)
       default))))

(defn get-string
  "Get string value of `setting-definition-or-name`. This is the default getter for `:string` settings. Value is fetched
  as follows:

  1. From corresponding env var, if any;
  2. From the database (i.e., set via the admin panel), if a value is present;
  3. The default value, if one was specified, *if* it is a string.

  If the fetched value is an empty string it is considered to be unset and this function returns `nil`."
  ^String [setting-definition-or-name]
  (let [v (or (env-var-value setting-definition-or-name)
              (db-or-cache-value setting-definition-or-name)
              (default-value setting-definition-or-name string?))]
    (when (seq v)
      v)))

(s/defn string->boolean :- (s/maybe s/Bool)
  "Interpret a `string-value` of a Setting as a boolean."
  [string-value :- (s/maybe s/Str)]
  (when (seq string-value)
    (case (str/lower-case string-value)
      "true"  true
      "false" false
      (throw (Exception.
              (tru "Invalid value for string: must be either \"true\" or \"false\" (case-insensitive)."))))))

(defn get-boolean
  "Get the value of `setting-definition-or-name` as a boolean. Default getter for `:boolean` Settings.

  Calls [[get-string]] to get the underlying string value from the DB or env var. If a string value is found, parses
  it as a boolean using the rules below; if not, returns the [[default-value]] directly if it it is a boolean.

  Strings are parsed as follows:

  * `true`  if *lowercased* string value is `true`
  * `false` if *lowercased* string value is `false`.
  * Otherwise, throw an Exception."
  ^Boolean [setting-definition-or-name]
  (if-let [s (get-string setting-definition-or-name)]
    (string->boolean s)
    (default-value setting-definition-or-name boolean?)))

(defn get-integer
  "Get the value of `setting-definition-or-name` as a long. Default getter for `:integer` Settings.

  Calls [[get-string]] to get the underlying string value from the DB or env var. If a string value is found, converts
  it to a keyword with [[java.lang.Long/parseLong]]; if not, returns the [[default-value]] directly if it it is an
  integer."
  ^Long [setting-definition-or-name]
  (if-let [s (get-string setting-definition-or-name)]
    (Long/parseLong s)
    ;; if default is actually `Integer` or something make sure we return an instance of `Long`.
    (some-> (default-value setting-definition-or-name integer?) long)))

(defn get-double
  "Get the value of `setting-definition-or-name` as a double. Default getter for `:double` Settings.

  Calls [[get-string]] to get the underlying string value from the DB or env var. If a string value is found, converts
  it to a keyword with [[java.lang.Double/parseDouble]]; if not, returns the [[default-value]] directly if it it is a
  double."
  ^Double [setting-definition-or-name]
  (if-let [s (get-string setting-definition-or-name)]
    (Double/parseDouble s)
    (default-value setting-definition-or-name double?)))

(defn get-keyword
  "Get the value of `setting-definition-or-name` as a keyword. Default getter for `:keyword` Settings.

  Calls [[get-string]] to get the underlying string value from the DB or env var. If a string value is found, converts
  it to a keyword with [[keyword]]; if not, returns the [[default-value]] directly if it it is a keyword."
  ^clojure.lang.Keyword [setting-definition-or-name]
  (if-let [s (get-string setting-definition-or-name)]
    (keyword s)
    (default-value setting-definition-or-name keyword?)))

(defn get-json
  "Get the value of `setting-definition-or-name` as parsed JSON. Default getter for `:json` Settings.

  Calls [[get-string]] to get the underlying string value from the DB or env var. If a string value is found, parses
  it with [[cheshire.core/parse-string]]; if not, returns the [[default-value]] directly if it it is a collection."
  [setting-definition-or-name]
  (try
    (if-let [s (get-string setting-definition-or-name)]
      (json/parse-string s keyword)
      (default-value setting-definition-or-name coll?))
    (catch Throwable e
      (let [{setting-name :name} (resolve-setting setting-definition-or-name)]
        (throw (ex-info (tru "Error parsing JSON setting {0}: {1}" setting-name (ex-message e))
                        {:setting setting-name}
                        e))))))

(defn get-timestamp
  "Get the value of `setting-definition-or-name` as a [[java.time.temporal.Temporal]] of some sort (e.g.
  a [[java.time.OffsetDateTime]]. Default getter for `:timestamp` Settings.

  Calls [[get-string]] to get the underlying string value from the DB or env var. If a string value is found, parses
  it with [[metabase.util.date-2/parse]]; if not, returns the [[default-value]] directly if it it is an instance
  of [[java.time.temporal.Temporal]]."
  ^Temporal [setting-definition-or-name]
  (if-let [s (get-string setting-definition-or-name)]
    (u.date/parse s)
    (default-value setting-definition-or-name (partial instance? Temporal))))

(defn get-csv
  "Get the value of `setting-definition-or-name` as a sequence of exploded strings. Default getter for `:csv`
  Settings.

  Calls [[get-string]] to get the underlying string value from the DB or env var. If a string value is found, parses
  it with [[clojure.data.csv/read-csv]]; if not, returns the [[default-value]] directly if it it is sequential."
  [setting-definition-or-name]
  (if-let [s (get-string setting-definition-or-name)]
    (some-> s csv/read-csv first)
    (default-value setting-definition-or-name sequential?)))

(def ^:private default-getter-for-type
  {:string    get-string
   :boolean   get-boolean
   :integer   get-integer
   :keyword   get-keyword
   :json      get-json
   :timestamp get-timestamp
   :double    get-double
   :csv       get-csv})

(defn get
  "Fetch the value of `setting-definition-or-name`. What this means depends on the Setting's `:getter`; by default, this
  looks for first for a corresponding env var, then checks the cache, then returns the default value of the Setting,
  if any."
  [setting-definition-or-name]
  (let [{:keys [cache? getter]} (resolve-setting setting-definition-or-name)
        disable-cache?          (not cache?)]
    (if (= *disable-cache* disable-cache?)
      (getter)
      (binding [*disable-cache* disable-cache?]
        (getter)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                      set!                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- update-setting!
  "Update an existing Setting. Used internally by `set-string!` below; do not use directly."
  [setting-name new-value]
  (assert (not= setting-name cache/settings-last-updated-key)
    (tru "You cannot update `settings-last-updated` yourself! This is done automatically."))
  ;; This is indeed a very annoying way of having to do things, but `update-where!` doesn't call `pre-update` (in case
  ;; it updates thousands of objects). So we need to manually trigger `pre-update` behavior by calling `do-pre-update`
  ;; so that `value` can get encrypted if `MB_ENCRYPTION_SECRET_KEY` is in use. Then take that possibly-encrypted
  ;; value and pass that into `update-where!`.
  (let [{maybe-encrypted-new-value :value} (models/do-pre-update Setting {:value new-value})]
    (db/update-where! Setting {:key setting-name}
      :value maybe-encrypted-new-value)))

(defn- set-new-setting!
  "Insert a new row for a Setting. Used internally by `set-string!` below; do not use directly."
  [setting-name new-value]
  (try (db/insert! Setting
         :key   setting-name
         :value new-value)
       ;; if for some reason inserting the new value fails it almost certainly means the cache is out of date
       ;; and there's actually a row in the DB that's not in the cache for some reason. Go ahead and update the
       ;; existing value and log a warning
       (catch Throwable e
         (log/warn (deferred-tru "Error inserting a new Setting:") "\n"
                   (.getMessage e) "\n"
                   (deferred-tru "Assuming Setting already exists in DB and updating existing value."))
         (update-setting! setting-name new-value))))

(defn- obfuscated-value? [v]
  (when (seq v)
    (boolean (re-matches #"^\*{10}.{2}$" v))))

(s/defn set-string!
  "Set string value of `setting-definition-or-name`. A `nil` or empty `new-value` can be passed to unset (i.e., delete)
  `setting-definition-or-name`. String-type settings use this function directly; all other types ultimately call this (e.g.
  `set-boolean!` eventually calls `set-string!`). Returns the `new-value`."
  [setting-definition-or-name, new-value :- (s/maybe s/Str)]
  (let [new-value                         (when (seq new-value)
                                            new-value)
        {:keys [sensitive?], :as setting} (resolve-setting setting-definition-or-name)
        obfuscated?                       (and sensitive? (obfuscated-value? new-value))
        setting-name                      (setting-name setting)]
    ;; if someone attempts to set a sensitive setting to an obfuscated value (probably via a misuse of the `set-many!`
    ;; function, setting values that have not changed), ignore the change. Log a message that we are ignoring it.
    (if obfuscated?
      (log/info (trs "Attempted to set Setting {0} to obfuscated value. Ignoring change." setting-name))
      (do
        ;; always update the cache entirely when updating a Setting.
        (cache/restore-cache!)
        ;; write to DB
        (cond
          (nil? new-value)
          (db/simple-delete! Setting :key setting-name)

          ;; if there's a value in the cache then the row already exists in the DB; update that
          (contains? (cache/cache) setting-name)
          (update-setting! setting-name new-value)

          ;; if there's nothing in the cache then the row doesn't exist, insert a new one
          :else
          (set-new-setting! setting-name new-value))
        ;; update cached value
        (cache/update-cache! setting-name new-value)
        ;; Record the fact that a Setting has been updated so eventaully other instances (if applicable) find out
        ;; about it (For Settings that don't use the Cache, don't update the `last-updated` value, because it will
        ;; cause other instances to do needless reloading of the cache from the DB)
        (when-not *disable-cache*
          (cache/update-settings-last-updated!))
        ;; Now return the `new-value`.
        new-value))))

(defn set-keyword!
  "Set the value of a keyword `setting-definition-or-name` `new-value` can be `nil`, a string, or a keyword."
  [setting-definition-or-name new-value]
  (set-string! setting-definition-or-name (u/qualified-name new-value)))

(defn set-boolean!
  "Set the value of boolean `setting-definition-or-name`. `new-value` can be nil, a boolean, or a string representation of one,
  such as `\"true\"` or `\"false\"` (these strings are case-insensitive)."
  [setting-definition-or-name new-value]
  (set-string! setting-definition-or-name (if (string? new-value)
                                            (set-boolean! setting-definition-or-name (string->boolean new-value))
                                            (case new-value
                                              true  "true"
                                              false "false"
                                              nil   nil))))

(defn set-integer!
  "Set the value of integer `setting-definition-or-name`."
  [setting-definition-or-name new-value]
  (set-string! setting-definition-or-name (when new-value
                                            (assert (or (integer? new-value)
                                                        (and (string? new-value)
                                                             (re-matches #"^\d+$" new-value))))
                                            (str new-value))))

(defn set-double!
  "Set the value of double `setting-definition-or-name`."
  [setting-definition-or-name new-value]
  (set-string! setting-definition-or-name (when new-value
                                            (assert (or (number? new-value)
                                                        (and (string? new-value)
                                                             (re-matches #"[+-]?([0-9]*[.])?[0-9]+" new-value))))
                                            (str new-value))))

(defn set-json!
  "Serialize `new-value` for `setting-definition-or-name` as a JSON string and save it."
  {:style/indent 1}
  [setting-definition-or-name new-value]
  (set-string! setting-definition-or-name (some-> new-value json/generate-string)))

(defn set-timestamp!
  "Serialize `new-value` for `setting-definition-or-name` as a ISO 8601-encoded timestamp string and save it."
  [setting-definition-or-name new-value]
  (set-string! setting-definition-or-name (some-> new-value u.date/format)))

(defn- serialize-csv [value]
  (cond
    ;; if we're passed as string, assume it's already CSV-encoded
    (string? value)
    value

    (sequential? value)
    (let [s (with-open [writer (StringWriter.)]
              (csv/write-csv writer [value])
              (str writer))]
      (first (str/split-lines s)))

    :else
    value))

(defn set-csv!
  "Serialize `new-value` for `setting-definition-or-name` as a CSV-encoded string and save it."
  [setting-definition-or-name new-value]
  (set-string! setting-definition-or-name (serialize-csv new-value)))

(def ^:private default-setter-for-type
  {:string    set-string!
   :keyword   set-keyword!
   :boolean   set-boolean!
   :integer   set-integer!
   :json      set-json!
   :timestamp set-timestamp!
   :double    set-double!
   :csv       set-csv!})

(defn set!
  "Set the value of `setting-definition-or-name`. What this means depends on the Setting's `:setter`; by default, this just updates
   the Settings cache and writes its value to the DB.

    (set :mandrill-api-key \"xyz123\")

   Style note: prefer using the setting directly instead:

     (mandrill-api-key \"xyz123\")"
  [setting-definition-or-name new-value]
  (let [{:keys [setter cache?], :as setting} (resolve-setting setting-definition-or-name)
        name                                 (setting-name setting)]
    (when (= setter :none)
      (throw (UnsupportedOperationException. (tru "You cannot set {0}; it is a read-only setting." name))))
    (binding [*disable-cache* (not cache?)]
      (setter new-value))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               register-setting!                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn register-setting!
  "Register a new Setting with a map of `SettingDefinition` attributes. Returns the map it was passed. This is used
  internally be `defsetting`; you shouldn't need to use it yourself."
  [{setting-name :name, setting-ns :namespace, setting-type :type, default :default, :as setting}]
  (let [munged-name (munge-setting-name (name setting-name))]
    (u/prog1 (let [setting-type (s/validate Type (or setting-type :string))]
               (merge
                {:name        setting-name
                 :munged-name munged-name
                 :namespace   setting-ns
                 :description nil
                 :type        setting-type
                 :default     default
                 :on-change   nil
                 :getter      (partial (default-getter-for-type setting-type) setting-name)
                 :setter      (partial (default-setter-for-type setting-type) setting-name)
                 :tag         (default-tag-for-type setting-type)
                 :visibility  :admin
                 :sensitive?  false
                 :cache?      true}
                (dissoc setting :name :type :default)))
      (s/validate SettingDefinition <>)
      (validate-default-value-for-type <>)
      ;; eastwood complains about (setting-name @registered-settings) for shadowing the function `setting-name`
      (when-let [registered-setting (clojure.core/get @registered-settings setting-name)]
        (when (not= setting-ns (:namespace registered-setting))
          (throw (ex-info (tru "Setting {0} already registered in {1}" setting-name (:namespace registered-setting))
                          {:existing-setting (dissoc registered-setting :on-change :getter :setter)}))))
      (when-let [same-munge (first (filter (comp #{munged-name} :munged-name)
                                           (vals @registered-settings)))]
        (when (not= setting-name (:name same-munge)) ;; redefinitions are fine
          (throw (ex-info (tru "Setting names in would collide: {0} and {1}"
                                setting-name (:name same-munge))
                          {:existing-setting (dissoc same-munge :on-change :getter :setter)
                           :new-setting      (dissoc <> :on-change :getter :setter)}))))
      (swap! registered-settings assoc setting-name <>))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                defsetting macro                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn metadata-for-setting-fn
  "Create metadata for the function automatically generated by `defsetting`."
  [{:keys [default description tag], setting-type :type, :as setting}]
  {:arglists '([] [new-value])
   ;; indentation below is intentional to make it clearer what shape the generated documentation is going to take.
   ;; Turn on auto-complete-mode in Emacs and see for yourself!
   :tag tag
   :doc (str/join
         "\n"
         [        description
          ""
          (format "`%s` is a %s Setting. You can get its value by calling:" (setting-name setting) (name setting-type))
          ""
          (format "    (%s)"                                                (setting-name setting))
          ""
          "and set its value by calling:"
          ""
          (format "    (%s <new-value>)"                                    (setting-name setting))
          ""
          (format "You can also set its value with the env var `%s`."       (env-var-name setting))
          ""
          "Clear its value by calling:"
          ""
          (format "    (%s nil)"                                            (setting-name setting))
          ""
          (format "Its default value is `%s`."                              (pr-str default))])})

(defn setting-fn
  "Create the automatically defined getter/setter function for settings defined by `defsetting`."
  [setting]
  (fn
    ([]
     (get setting))

    ([new-value]
     ;; need to qualify this or otherwise the reader gets this confused with the set! used for things like
     ;; (set! *warn-on-reflection* true)
     ;; :refer-clojure :exclude doesn't seem to work in this case
     (metabase.models.setting/set! setting new-value))))

(defn- is-expression? [symbols expression]
  (when (list? expression)
    ((set symbols) (first expression))))

(defn- valid-trs-or-tru? [desc]
  (is-expression? #{'deferred-trs 'deferred-tru `deferred-trs `deferred-tru} desc))

(defn- valid-str-of-trs-or-tru? [maybe-str-expr]
  (when (is-expression? #{'str `str} maybe-str-expr)
    ;; When there are several i18n'd sentences, there will probably be a surrounding `str` invocation and a space in
    ;; between the sentences, remove those to validate the i18n clauses
    (let [exprs-without-strs (remove (every-pred string? str/blank?) (rest maybe-str-expr))]
      ;; We should have at lease 1 i18n clause, so ensure `exprs-without-strs` is not empty
      (and (seq exprs-without-strs)
           (every? valid-trs-or-tru? exprs-without-strs)))))

(defn- validate-description
  "Validates the description expression `desc-expr`, ensuring it contains an i18n form, or a string consisting of 1 or
  more i18n forms"
  [desc]
  (when-not (or (valid-trs-or-tru? desc)
                (valid-str-of-trs-or-tru? desc))
    (throw (IllegalArgumentException.
            (trs "defsetting descriptions strings must have `:visibilty` `:internal`, `:setter` `:none`, or internationalized, found: `{0}`"
                 (pr-str desc)))))
  desc)

(defmacro defsetting
  "Defines a new Setting that will be added to the DB at some point in the future.
   Conveniently can be used as a getter/setter as well:

     (defsetting mandrill-api-key (trs \"API key for Mandrill.\"))
     (mandrill-api-key)           ; get the value
     (mandrill-api-key new-value) ; update the value
     (mandrill-api-key nil)       ; delete the value

   A setting can be set from the Admin Panel or via the corresponding env var, eg. `MB_MANDRILL_API_KEY` for the
   example above.

   You may optionally pass any of the OPTIONS below:

   *  `:default`    - The default value of the setting. This must be of the same type as the Setting type, e.g. the
                      default for an `:integer` setting must be some sort of integer. (default: `nil`)

   *  `:type`       - `:string` (default), `:boolean`, `:integer`, `:json`, `:double`, or `:timestamp`. Non-`:string`
                      Settings have special default getters and setters that automatically coerce values to the correct
                      types.

   *  `:visibility` - `:public`, `:authenticated`, `:admin` (default), or `:internal`. Controls where this setting is
                      visible

   *  `:getter`     - A custom getter fn, which takes no arguments. Overrides the default implementation. (This can in
                      turn call functions in this namespace like `get-string` or `get-boolean` to invoke the default
                      getter behavior.)

   *  `:setter`     - A custom setter fn, which takes a single argument, or `:none` for read-only settings. Overrides the
                      default implementation. (This can in turn call functions in this namespace like `set-string!` or
                      `set-boolean!` to invoke the default setter behavior. Keep in mind that the custom setter may be
                      passed `nil`, which should clear the values of the Setting.)

   *  `:cache?`     - Should this Setting be cached? (default `true`)? Be careful when disabling this, because it could
                      have a very negative performance impact.

   *  `:sensitive?` - Is this a sensitive setting, such as a password, that we should never return in plaintext?
                      (Default: `false`). Obfuscation is not done by getter functions, but instead by functions that
                      ultimately return these values via the API, such as `all` below. (In other words, code in the
                      backend can continute to consume sensitive Settings normally; sensitivity is a purely user-facing
                      option.)"
  {:style/indent 1}
  [setting-symb description & {:as options}]
  {:pre [(symbol? setting-symb)]}
  `(let [desc# ~(if (or (= (:visibility options) :internal)
                        (= (:setter options) :none))
                  description
                  (validate-description description))
         setting# (register-setting! (assoc ~options
                                            :name ~(keyword setting-symb)
                                            :description desc#
                                            :namespace (ns-name *ns*)))]
     (-> (def ~setting-symb (setting-fn setting#))
         (alter-meta! merge (metadata-for-setting-fn setting#)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 EXTRA UTIL FNS                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn set-many!
  "Set the value of several Settings at once.

    (set-all {:mandrill-api-key \"xyz123\", :another-setting \"ABC\"})"
  [settings]
  {:pre [(map? settings)]}
  ;; if setting any of the settings fails, roll back the entire DB transaction and the restore the cache from the DB
  ;; to revert any changes in the cache
  (try
    (db/transaction
      (doseq [[k v] settings]
        (metabase.models.setting/set! k v)))
    (catch Throwable e
      (cache/restore-cache!)
      (throw e)))
  ;; TODO - This event is no longer neccessary or desirable. This is used in only a single place, to stop or restart
  ;; the MetaBot when settings are updated ; this only works if the setting is updated via this specific function.
  ;; Instead, we should define a custom setter for the relevant setting that additionally performs the desired
  ;; operations when the value is updated. This pattern is easier to understand, works no matter how the setting is
  ;; changed, and doesn't run when irrelevant changes (to other settings) are made.
  (events/publish-event! :settings-update settings))

(defn- obfuscate-value
  "Obfuscate the value of sensitive Setting. We'll still show the last 2 characters so admins can still check that the
  value is what's expected (e.g. the correct password).

    (obfuscate-value \"sensitivePASSWORD123\") ;; -> \"**********23\""
  [s]
  (str "**********" (str/join (take-last 2 (str s)))))

(defn user-facing-value
  "Get the value of a Setting that should be displayed to a User (i.e. via `/api/setting/` endpoints): for Settings set
  via env vars, or Settings whose value has not been set (i.e., Settings whose value is the same as the default value)
  no value is displayed; for sensitive Settings, the value is obfuscated.

  Accepts options:

  * `:getter` -- the getter function to use to fetch the Setting value. By default, uses `setting/get`, which will
    convert the setting to the appropriate type; you can use `get-string` to get all string values of Settings, for
    example."
  [setting-definition-or-name & {:keys [getter], :or {getter get}}]
  (let [{:keys [sensitive? visibility default], k :name, :as setting} (resolve-setting setting-definition-or-name)
        unparsed-value                                                (get-string k)
        parsed-value                                                  (getter k)
        ;; `default` and `env-var-value` are probably still in serialized form so compare
        value-is-default?                                             (= parsed-value default)
        value-is-from-env-var?                                        (some-> (env-var-value setting) (= unparsed-value))]
    (cond
      ;; TODO - Settings set via an env var aren't returned for security purposes. It is an open question whether we
      ;; should obfuscate them and still show the last two characters like we do for sensitive values that are set via
      ;; the UI.
      (or value-is-default? value-is-from-env-var?)
      nil

      (= visibility :internal)
      (throw (Exception. (tru "Setting {0} is internal" k)))

      sensitive?
      (obfuscate-value parsed-value)

      :else
      parsed-value)))

(defn- user-facing-info
  [{:keys [sensitive? default description], k :name, :as setting} & {:as options}]
  (let [set-via-env-var? (boolean (env-var-value setting))]
    {:key            k
     :value          (try
                       (m/mapply user-facing-value setting options)
                       (catch Throwable e
                         (log/error e (trs "Error fetching value of Setting"))))
     :is_env_setting set-via-env-var?
     :env_name       (env-var-name setting)
     :description    (str description)
     :default        (if set-via-env-var?
                       (tru "Using value of env var {0}" (str \$ (env-var-name setting)))
                       default)}))

(defn all
  "Return a sequence of Settings maps in a format suitable for consumption by the frontend.
   (For security purposes, this doesn't return the value of a Setting if it was set via env var).

   `options` are passed to `user-facing-value`."
  [& {:as options}]
  (for [setting (sort-by :name (vals @registered-settings))
        :when   (not= (:visibility setting) :internal)]
    (m/mapply user-facing-info setting options)))

(defn properties
  "Returns settings values for a given :visibility"
  [visibility]
  (->> @registered-settings
       (filter (fn [[_ options]] (and (not (:sensitive? options))
                                      (= (:visibility options) visibility))))
       (map (fn [[name]] [name (get name)]))
       (into {})))
