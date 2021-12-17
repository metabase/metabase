(ns metabase.models.setting
  "Settings are a fast and simple way to create a setting that can be set from the admin page. They are saved to the
  application Database, but intelligently cached internally for super-fast lookups.

  Define a new Setting with [[defsetting]] (optionally supplying things like default value, type, or custom getters &
  setters):

    (defsetting mandrill-api-key \"API key for Mandrill\")

  The newly-defined Setting will automatically be made available to the frontend client depending on its [[Visibility]].

  You can also set the value via the corresponding env var, which looks like `MB_MANDRILL_API_KEY`, where the name of
  the Setting is converted to uppercase and dashes to underscores.

  The var created with [[defsetting]] can be used as a getter/setter, or you can use [[get]] and [[set!]]:

    (require '[metabase.models.setting :as setting])

    (setting/get :mandrill-api-key)           ; only returns values set explicitly from the Admin Panel
    (mandrill-api-key)                        ; returns value set in the Admin Panel, OR value of corresponding env var,
                                                 ; OR the default value, if any (in that order)

    (setting/set! :mandrill-api-key \"NEW_KEY\")
    (mandrill-api-key \"NEW_KEY\")

    (setting/set! :mandrill-api-key nil)
    (mandrill-api-key nil)

  You can define additional Settings types adding implementations of [[default-tag-for-type]], [[get-value-of-type]],
  and [[set-value-of-type!]].

  [[admin-writable-settings]] and [[user-readable-values-map]] can be used to fetch *all* Admin-writable and
  User-readable Settings, respectively. See their docstrings for more information.

  ### Database-Local Settings

  Starting in 0.42.0, some Settings are allowed to have Database-specific values that override the normal site-wide
  value. These are similar in concept to buffer-local variables in Emacs Lisp.

  When a Setting is allowed to be Database-local, any values in [[*database-local-values*]] for that Setting will
  be returned preferentially to site-wide values of that Setting. [[*database-local-values*]] comes from the
  `Database.settings` column in the application DB. Database-local values can only override site-wide values when
  non-`nil`; `nil` values in [[*database-local-values*]]` are ignored.

  Whether or not a Setting can be Database-local is controlled by the `:database-local` option passed
  to [[defsetting]]. There are three valid values of this option:

  * `:only` means this Setting can *only* have a Database-local value and cannot have a 'normal' site-wide value. It
  cannot be set via env var. Default values are still allowed for Database-local-only Settings. Database-local-only
  Settings are never returned by [[admin-writable-settings]] or [[user-readable-values-map]] regardless of
  their [[Visibility]].

  * `:allowed` means this Setting can be Database-local and can also have a normal site-wide value; if both are
  specified, the Database-specific value will be set and returned when we are in the context of a specific
  Database (i.e., [[*database-local-values*]] is bound).

  * `:never` means Database-specific values cannot be set for this Setting. Values in [[*database-local-values*]]
  will be ignored.

  `:never` is the default value of `:database-local`; to allow Database-local values, the Setting definition must
  explicitly specify `:database-local` `:only` or `:allowed`.

  ###### Motivation

  Now that we know a little about what Database-local Settings *are*, let's briefly discuss the motivation behind them.

  There are actually a lot of good use cases for Database-local Settings. In some cases we want to specify sane
  defaults for things like row limits, but allow them to be set on *either* a site-wide or per-Database basis.
  Something like [[metabase.driver/report-timezone]] has long been something we've wanted to allow Database-specific
  overrides for. To implement that, do we add a new column for the Database-specific override, and then rework all the
  code that uses that to check either the Database-specific value, *or* fall back
  to [[metabase.driver/report-timezone]] if one is not set?

  That's certainly one option, but wouldn't it be nicer to solve this problem more generally? What if we want to do
  the same thing yet another Setting in the future --
  perhaps [[metabase.query-processor.middleware.constraints/max-results-bare-rows]], as proposed in #19267? Do we
  continue the pattern of adding new columns and reworking existing code forever?

  Clearly being able to leverage the existing Settings framework will save us effort in the long run. (If you're still
  not convinced, see #14055 for more information.)"
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

;; TODO -- a way to SET Database-local values.
(def ^:dynamic *database-local-values*
  "Database-local Settings values (as a map of Setting name -> already-deserialized value). This comes from the value of
  `Database.settings` in the application DB. When bound, any Setting that *can* be Database-local will have a value
  from this map returned preferentially to the site-wide value.

  This is normally bound automatically in Query Processor context
  by [[metabase.query-processor.middleware.resolve-database-and-driver]]. You may need to manually bind it in other
  places where you want to use Database-local values.

  TODO -- we should probably also bind this in sync contexts e.g. functions in [[metabase.sync]]."
  nil)

(models/defmodel Setting
  "The model that underlies [[defsetting]]."
  :setting)

(u/strict-extend (class Setting)
  models/IModel
  (merge models/IModelDefaults
         {:types       (constantly {:value :encrypted-text})
          :primary-key (constantly :key)}))

(declare get-value-of-type)

(def ^:private Type
  (s/pred (fn [a-type]
            (contains? (set (keys (methods get-value-of-type))) a-type))
          "Valid Setting :type"))

(def ^:private Visibility
  (s/enum :public :authenticated :admin :internal))

(defmulti default-tag-for-type
  "Type tag that will be included in the Setting's metadata, so that the getter function will not cause reflection
  warnings."
  {:arglists '([setting-type])}
  keyword)

(defmethod default-tag-for-type :default   [_] `Object)
(defmethod default-tag-for-type :string    [_] `String)
(defmethod default-tag-for-type :boolean   [_] `Boolean)
(defmethod default-tag-for-type :integer   [_] `Long)
(defmethod default-tag-for-type :double    [_] `Double)
(defmethod default-tag-for-type :timestamp [_] `Temporal)
(defmethod default-tag-for-type :keyword   [_] `Keyword)

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

;; This is called `LocalOption` rather than `DatabaseLocalOption` or something like that because we intend to also add
;; User-Local Settings at some point in the future. The will use the same options
(def ^:private LocalOption
  "Schema for valid values of `:database-local`. See [[metabase.models.setting]] docstring for description of what these
  options mean."
  (s/enum :only :allowed :never))

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

   ;; whether this Setting can be Database-local. See [[metabase.models.setting]] docstring for more info.
   :database-local LocalOption

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

(defn- allows-database-local-values? [setting]
  (#{:only :allowed} (:database-local (resolve-setting setting))))

(defn- allows-site-wide-values? [setting]
  (not= (:database-local (resolve-setting setting)) :only))

(defn- database-local-value [setting-definition-or-name]
  (let [{setting-name :name, :as setting} (resolve-setting setting-definition-or-name)]
    (when (allows-database-local-values? setting)
      (core/get *database-local-values* setting-name))))

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
  (let [setting (resolve-setting setting-definition-or-name)]
    (when (allows-site-wide-values? setting)
      (let [v (env/env (keyword (str "mb-" (munge-setting-name (setting-name setting)))))]
        (when (seq v)
          v)))))

(def ^:private ^:dynamic *disable-cache* false)

(defn- db-or-cache-value
  "Get the value, if any, of `setting-definition-or-name` from the DB (using / restoring the cache as needed)."
  ^String [setting-definition-or-name]
  (let [setting (resolve-setting setting-definition-or-name)]
    (when (allows-site-wide-values? setting)
      (let [v (if *disable-cache*
                (db/select-one-field :value Setting :key (setting-name setting-definition-or-name))
                (do
                  (cache/restore-cache-if-needed!)
                  (clojure.core/get (cache/cache) (setting-name setting-definition-or-name))))]
        (when (seq v)
          v)))))

(defn default-value
  "Get the `:default` value of `setting-definition-or-name` if one was specified."
  [setting-definition-or-name]
  (let [{:keys [default]} (resolve-setting setting-definition-or-name)]
    default))

(defn get-raw-value
  "Get the raw value of a Setting from wherever it may be specified. Value is fetched by trying the following sources in
  order:

  1. From [[*database-local-values*]] if this Setting is allowed to have a Database-local value
  2. From the corresponding env var (excluding empty string values)
  3. From the application database (i.e., set via the admin panel) (excluding empty string values)
  4. The default value, if one was specified

  !!!!!!!!!! The value returned MAY OR MAY NOT be a String depending on the source !!!!!!!!!!

  This is the underlying function powering all the other getters such as methods of [[get-value-of-type]]. These
  getter functions *must* be coded to handle either String or non-String values. You can use the three-arity version
  of this function to do that.

  Three-arity version can be used to specify how to parse non-empty String values (`parse-fn`) and under what
  conditions values can be returned directly (`pred`) -- see [[get-value-of-type]] for `:boolean` for example usage."
  ([setting-definition-or-name]
   (let [setting    (resolve-setting setting-definition-or-name)
         source-fns [database-local-value
                     env-var-value
                     db-or-cache-value
                     default-value]]
     (loop [[f & more] source-fns]
       (let [v (f setting)]
         (cond
           (some? v)  v
           (seq more) (recur more))))))

  ([setting-definition-or-name pred parse-fn]
   (let [parse     (fn [v]
                     (try
                       (parse-fn v)
                       (catch Throwable e
                         (let [{setting-name :name} (resolve-setting setting-definition-or-name)]
                           (throw (ex-info (tru "Error parsing Setting {0}: {1}" setting-name (ex-message e))
                                           {:setting setting-name}
                                           e))))))
         raw-value (get-raw-value setting-definition-or-name)
         v         (cond-> raw-value
                     (string? raw-value) parse)]
     (when (pred v)
       v))))

(defmulti get-value-of-type
  "Get the value of `setting-definition-or-name` as a value of type `setting-type`. This is used as the default getter
  for Settings with `setting-type`.

  Impls should call [[get-raw-value]] to get the underlying possibly-serialized value and parse it appropriately if it
  comes back as a String; impls should only return values that are of the correct type (e.g. the `:boolean` impl
  should only return [[Boolean]] values)."
  {:arglists '([setting-type setting-definition-or-name])}
  (fn [setting-type _]
    (keyword setting-type)))

(defmethod get-value-of-type :string
  [_setting-type setting-definition-or-name]
  (get-raw-value setting-definition-or-name string? identity))

(s/defn string->boolean :- (s/maybe s/Bool)
  "Interpret a `string-value` of a Setting as a boolean."
  [string-value :- (s/maybe s/Str)]
  (when (seq string-value)
    (case (str/lower-case string-value)
      "true"  true
      "false" false
      (throw (Exception.
              (tru "Invalid value for string: must be either \"true\" or \"false\" (case-insensitive)."))))))

;; Strings are parsed as follows:
;;
;; * `true`  if *lowercased* string value is `true`
;; * `false` if *lowercased* string value is `false`.
;; * Otherwise, throw an Exception.
(defmethod get-value-of-type :boolean
  [_setting-type setting-definition-or-name]
  (get-raw-value setting-definition-or-name boolean? string->boolean))

(defmethod get-value-of-type :integer
  [_setting-type setting-definition-or-name]
  (get-raw-value setting-definition-or-name integer? #(Long/parseLong ^String %)))

(defmethod get-value-of-type :double
  [_setting-type setting-definition-or-name]
  (get-raw-value setting-definition-or-name double? #(Double/parseDouble ^String %)))

(defmethod get-value-of-type :keyword
  [_setting-type setting-definition-or-name]
  (get-raw-value setting-definition-or-name keyword? keyword))

(defmethod get-value-of-type :timestamp
  [_setting-type setting-definition-or-name]
  (get-raw-value setting-definition-or-name #(instance? Temporal %) u.date/parse))

(defmethod get-value-of-type :json
  [_setting-type setting-definition-or-name]
  (get-raw-value setting-definition-or-name coll? #(json/parse-string % true)))

(defmethod get-value-of-type :csv
  [_setting-type setting-definition-or-name]
  (get-raw-value setting-definition-or-name sequential? (comp first csv/read-csv)))

(defn- default-getter-for-type [setting-type]
  (partial get-value-of-type (keyword setting-type)))

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
  "Update an existing Setting. Used internally by [[set-value-of-type!]] for `:string` below; do not use directly."
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
  "Insert a new row for a Setting. Used internally by [[set-value-of-type!]] for `:string` below; do not use directly."
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

(defmulti set-value-of-type!
  "Set the value of a `setting-type` `setting-definition-or-name`. A `nil` value deletes the current value of the
  Setting (when set in the application database). Returns `new-value`.

  Impls of this method should ultimately call the implementation for `:string`, which handles the low-level logic of
  updating the cache and application database."
  {:arglists '([setting-type setting-definition-or-name new-value])}
  (fn [setting-type _ _]
    (keyword setting-type)))

(s/defmethod set-value-of-type! :string
  [_setting-type setting-definition-or-name new-value :- (s/maybe s/Str)]
  (let [new-value                         (when (seq new-value)
                                            new-value)
        {:keys [sensitive?], :as setting} (resolve-setting setting-definition-or-name)
        obfuscated?                       (and sensitive? (obfuscated-value? new-value))
        setting-name                      (setting-name setting)]
    ;; make sure we're not trying to set the value of a Database-local-only Setting or something like that
    (when-not (allows-site-wide-values? setting)
      (throw (ex-info (tru "Site-wide values are not allowed for Setting {0}" (:name setting))
                      {:setting (:name setting)})))
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

(defmethod set-value-of-type! :keyword
  [_setting-type setting-definition-or-name new-value]
  (set-value-of-type!
   :string setting-definition-or-name
   (u/qualified-name new-value)))

(defmethod set-value-of-type! :boolean
  [setting-type setting-definition-or-name new-value]
  (if (string? new-value)
    (set-value-of-type! setting-type setting-definition-or-name (string->boolean new-value))
    (let [s (case new-value
              true  "true"
              false "false"
              nil   nil)]
      (set-value-of-type! :string setting-definition-or-name s))))

(defmethod set-value-of-type! :integer
  [_setting-type setting-definition-or-name new-value]
  (set-value-of-type!
   :string setting-definition-or-name
   (when new-value
     (assert (or (integer? new-value)
                 (and (string? new-value)
                      (re-matches #"^\d+$" new-value))))
     (str new-value))))

(defmethod set-value-of-type! :double
  [_setting-type setting-definition-or-name new-value]
  (set-value-of-type!
   :string setting-definition-or-name
   (when new-value
     (assert (or (number? new-value)
                 (and (string? new-value)
                      (re-matches #"[+-]?([0-9]*[.])?[0-9]+" new-value))))
     (str new-value))))

(defmethod set-value-of-type! :json
  [_setting-type setting-definition-or-name new-value]
  (set-value-of-type!
   :string setting-definition-or-name
   (some-> new-value json/generate-string)))

(defmethod set-value-of-type! :timestamp
  [_setting-type setting-definition-or-name new-value]
  (set-value-of-type!
   :string setting-definition-or-name
   (some-> new-value u.date/format)))

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

(defmethod set-value-of-type! :csv
  [_setting-type setting-definition-or-name new-value]
  (set-value-of-type! :string setting-definition-or-name (serialize-csv new-value)))

(defn- default-setter-for-type [setting-type]
  (partial set-value-of-type! (keyword setting-type)))

(defn set!
  "Set the value of `setting-definition-or-name`. What this means depends on the Setting's `:setter`; by default, this
  just updates the Settings cache and writes its value to the DB.

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
  "Register a new Setting with a map of [[SettingDefinition]] attributes. Returns the map it was passed. This is used
  internally by [[defsetting]]; you shouldn't need to use it yourself."
  [{setting-name :name, setting-ns :namespace, setting-type :type, default :default, :as setting}]
  (let [munged-name (munge-setting-name (name setting-name))]
    (u/prog1 (let [setting-type (s/validate Type (or setting-type :string))]
               (merge
                {:name           setting-name
                 :munged-name    munged-name
                 :namespace      setting-ns
                 :description    nil
                 :type           setting-type
                 :default        default
                 :on-change      nil
                 :getter         (partial (default-getter-for-type setting-type) setting-name)
                 :setter         (partial (default-setter-for-type setting-type) setting-name)
                 :tag            (default-tag-for-type setting-type)
                 :visibility     :admin
                 :sensitive?     false
                 :cache?         true
                 :database-local :never}
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
  "Create metadata for the function automatically generated by [[defsetting]]."
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
  "Create the automatically defined getter/setter function for settings defined by [[defsetting]]."
  [setting]
  (fn
    ([]
     (get setting))

    ([new-value]
     ;; need to qualify this or otherwise the reader gets this confused with the set! used for things like
     ;; (set! *warn-on-reflection* true)
     ;; :refer-clojure :exclude doesn't seem to work in this case
     (metabase.models.setting/set! setting new-value))))

;; The next few functions are for validating the Setting description (i.e., docstring) at macroexpansion time. They
;; check that the docstring is a valid deferred i18n form (e.g. [[metabase.util.i18n/deferred-tru]]) so the Setting
;; description will be localized properly when it shows up in the FE admin interface.

(def ^:private allowed-deferred-i18n-forms
  #{`deferred-trs `deferred-tru})

(defn- is-form?
  "Whether `form` is a function call/macro call form starting with a symbol in `symbols`.

    (is-form? #{`deferred-tru} `(deferred-tru \"wow\")) ; -> true"
  [symbols form]
  (when (and (list? form)
             (symbol? (first form)))
    ;; resolve the symbol to a var and convert back to a symbol so we can get the actual name rather than whatever
    ;; alias the current namespace happens to be using
    (let [symb (symbol (resolve (first form)))]
      ((set symbols) symb))))

(defn- valid-trs-or-tru? [desc]
  (is-form? allowed-deferred-i18n-forms desc))

(defn- valid-str-of-trs-or-tru? [maybe-str-expr]
  (when (is-form? #{`str} maybe-str-expr)
    ;; When there are several i18n'd sentences, there will probably be a surrounding `str` invocation and a space in
    ;; between the sentences, remove those to validate the i18n clauses
    (let [exprs-without-strs (remove (every-pred string? str/blank?) (rest maybe-str-expr))]
      ;; We should have at lease 1 i18n clause, so ensure `exprs-without-strs` is not empty
      (and (seq exprs-without-strs)
           (every? valid-trs-or-tru? exprs-without-strs)))))

(defn- validate-description
  "Check that `description-form` is a i18n form (e.g. [[metabase.util.i18n/deferred-tru]]), or a [[str]] form consisting
  of one or more deferred i18n forms. Returns `description-form` as-is."
  [description-form]
  (when-not (or (valid-trs-or-tru? description-form)
                (valid-str-of-trs-or-tru? description-form))
    ;; this doesn't need to be i18n'ed because it's a compile-time error.
    (throw (ex-info (str "defsetting docstrings must be an *deferred* i18n form unless the Setting has"
                         " `:visibilty` `:internal` or `:setter` `:none`."
                         (format " Got: ^%s %s"
                                 (some-> description-form class (.getCanonicalName))
                                 (pr-str description-form)))
                    {:description-form description-form})))
  description-form)

(defmacro defsetting
  "Defines a new Setting that will be added to the DB at some point in the future.
  Conveniently can be used as a getter/setter as well

    (defsetting mandrill-api-key (trs \"API key for Mandrill.\"))
    (mandrill-api-key)           ; get the value
    (mandrill-api-key new-value) ; update the value
    (mandrill-api-key nil)       ; delete the value

  A setting can be set from the Admin Panel or via the corresponding env var, eg. `MB_MANDRILL_API_KEY` for the
  example above.

  You may optionally pass any of the `options` below:

  ###### `:default`

  The default value of the setting. This must be of the same type as the Setting type, e.g. the default for an
  `:integer` setting must be some sort of integer. (default: `nil`)

  ###### `:type`

  `:string` (default) or one of the other types that implement [[get-value-of-type]] and [[set-value-of-type]].
  Non-`:string` Settings have special default getters and setters that automatically coerce values to the correct
  types.

  ###### `:visibility`

  `:public`, `:authenticated`, `:admin` (default), or `:internal`. Controls where this setting is visible

  ###### `:getter`

  A custom getter fn, which takes no arguments. Overrides the default implementation. (This can in turn call functions
  in this namespace like methods of [[get-value-of-type]] to invoke the 'parent' getter behavior.)

  ###### `:setter`

  A custom setter fn, which takes a single argument, or `:none` for read-only settings. Overrides the default
  implementation. (This can in turn call methods of [[set-value-of-type!]] to invoke 'parent' setter behavior. Keep in
  mind that the custom setter may be passed `nil`, which should clear the values of the Setting.)

  ###### `:cache?`

  Should this Setting be cached? (default `true`)? Be careful when disabling this, because it could have a very
  negative performance impact.

  ###### `:sensitive?`

  Is this a sensitive setting, such as a password, that we should never return in plaintext? (Default: `false`).
  Obfuscation is not done by getter functions, but instead by functions that ultimately return these values via the
  API, such as [[admin-writable-settings]] below. (In other words, code in the backend can continute to consume
  sensitive Settings normally; sensitivity is a purely user-facing option.)

  ###### `:database-local`

  The ability of this Setting to be /Database-local/. Valid values are `:only`, `:allowed`, and `:never`. Default:
  `:never`. See docstring for [[metabase.models.setting]] for more information."
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
  convert the setting to the appropriate type; you can use `(partial get-value-of-type :string)` to get all string
  values of Settings, for example."
  [setting-definition-or-name & {:keys [getter], :or {getter get}}]
  (let [{:keys [sensitive? visibility default], k :name, :as setting} (resolve-setting setting-definition-or-name)
        unparsed-value                                                (get-value-of-type :string k)
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

(defn admin-writable-settings
  "Return a sequence of site-wide Settings maps in a format suitable for consumption by the frontend.
  (For security purposes, this doesn't return the value of a Setting if it was set via env var).

  `options` are passed to [[user-facing-value]].

  This is currently used by `GET /api/setting` ([[metabase.api.setting/GET_]]; admin-only; powers the Admin Settings
  page) so all admin-visible Settings should be included. Also used
  by [[metabase-enterprise.serialization.dump/dump-settings]] which should also have access to everything not
  `:internal`. In either case we *do not* want to return env var values -- we don't want to serialize them regardless
  of whether the value should be readable or not, and admins should not be allowed to modify them."
  [& {:as options}]
  ;; ignore Database-local values even if this is bound for some reason
  (binding [*database-local-values* nil]
    (into
     []
     (comp (filter (fn [setting]
                     (and (not= (:visibility setting) :internal)
                          (allows-site-wide-values? setting))))
           (map #(m/mapply user-facing-info % options)))
     (sort-by :name (vals @registered-settings)))))

(defn user-readable-values-map
  "Returns Settings as a map of setting name -> site-wide value for a given [[Visibility]] e.g. `:public`.

  Settings marked `:sensitive?` (e.g. passwords) are excluded.

  The is currently used by `GET /api/session/properties` ([[metabase.api.session/GET_properties]]) and
  in [[metabase.server.routes.index/load-entrypoint-template]]. These are used as read-only sources of Settings for
  the frontend client. For that reason, these Settings *should* include values that come back from environment
  variables, *unless* they are marked `:sensitive?`."
  [visibility]
  ;; ignore Database-local values even if this is bound for some reason
  (binding [*database-local-values* nil]
    (into
     {}
     (comp (filter (fn [[_ setting]]
                     (and (not (:sensitive? setting))
                          (allows-site-wide-values? setting)
                          (= (:visibility setting) visibility))))
           (map (fn [[setting-name]]
                  [setting-name (get setting-name)])))
     @registered-settings)))
