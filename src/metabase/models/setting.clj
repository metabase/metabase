(ns metabase.models.setting
  "Settings are a fast and simple way to create a setting that can be set
   from the admin page. They are saved to the Database, but intelligently
   cached internally for super-fast lookups.

   Define a new Setting with `defsetting` (optionally supplying a default value, type, or custom getters & setters):

      (defsetting mandrill-api-key \"API key for Mandrill\")

   The setting and docstr will then be auto-magically accessible from the admin page.

   You can also set the value via the corresponding env var, which looks like
   `MB_MANDRILL_API_KEY`, where the name of the setting is converted to uppercase and dashes to underscores.

   The var created with `defsetting` can be used as a getter/setter, or you can
   use `get` and `set!`:

       (require '[metabase.models.setting :as setting])

       (setting/get :mandrill-api-key)           ; only returns values set explicitly from SuperAdmin
       (mandrill-api-key)                        ; returns value set in SuperAdmin, OR value of corresponding env var, OR the default value, if any (in that order)

       (setting/set! :mandrill-api-key \"NEW_KEY\")
       (mandrill-api-key \"NEW_KEY\")

       (setting/set! :mandrill-api-key nil)
       (mandrill-api-key nil)

   Get a map of all Settings:

      (setting/all)"
  (:refer-clojure :exclude [get])
  (:require [clojure.string :as str]
            [environ.core :as env]
            [medley.core :as m]
            [schema.core :as s]
            (metabase [db :as db]
                      [events :as events])
            [metabase.models.interface :as i]
            [metabase.util :as u]))


(i/defentity Setting
  "The model that underlies `defsetting`."
  :setting)

(u/strict-extend (class Setting)
  i/IEntity
  (merge i/IEntityDefaults
         {:types (constantly {:value :clob})}))


(def ^:private Type
  (s/enum :string :boolean))

(def ^:private SettingDefinition
  {:setting-name s/Keyword
   :description  s/Str            ; used for docstring and is user-facing in the admin panel
   :default      (s/maybe s/Str)  ; this is a string because in the DB all settings are stored as strings; different getters can handle type conversion *from* string
   :setting-type Type             ; :string or :boolean
   :getter       clojure.lang.IFn
   :setter       clojure.lang.IFn
   :internal?    s/Bool})         ; should the API never return this setting? (default: false)


(defonce ^:private registered-settings
  (atom {}))

(s/defn ^:private ^:always-validate resolve-setting :- SettingDefinition
  [setting-or-name]
  (if (map? setting-or-name)
    setting-or-name
    (let [k (keyword setting-or-name)]
      (or (@registered-settings k)
          (throw (Exception. (format "Setting %s does not exist.\nFound: %s" k (sort (keys @registered-settings)))))))))


;;; ------------------------------------------------------------ cache ------------------------------------------------------------

;; Cache is a 1:1 mapping of what's in the DB
;; Cached lookup time is ~60µs, compared to ~1800µs for DB lookup

(def ^:private cache
  (atom nil))

(defn- restore-cache-if-needed! []
  (when-not @cache
    (reset! cache (db/select-field->field :key :value Setting))))


;;; ------------------------------------------------------------ get ------------------------------------------------------------

(defn- setting-name ^String [setting-or-name]
  (name (:setting-name (resolve-setting setting-or-name))))

(defn- env-var-name
  "Get the env var corresponding to SETTING-OR-NAME.
   (This is used primarily for documentation purposes)."
  ^String [setting-or-name]
  (let [setting (resolve-setting setting-or-name)]
    (str "MB_" (str/upper-case (str/replace (setting-name setting) "-" "_")))))

(defn env-var-value
  "Get the value of SETTING-OR-NAME from the corresponding env var, if any.
   The name of the Setting is converted to uppercase and dashes to underscores;
   for example, a setting named `default-domain` can be set with the env var `MB_DEFAULT_DOMAIN`."
  ^String [setting-or-name]
  (let [setting (resolve-setting setting-or-name)
        v       (env/env (keyword (str "mb-" (setting-name setting))))]
    (when (seq v)
      v)))

(defn- db-value
  "Get the value, if any, of SETTING-OR-NAME from the DB (using / restoring the cache as needed)."
  ^String [setting-or-name]
  (restore-cache-if-needed!)
  (clojure.core/get @cache (setting-name setting-or-name)))


(defn get-string
  "Get string value of SETTING-OR-NAME. This is the default getter for `String` settings; valuBis fetched as follows:

   1.  From the database (i.e., set via the admin panel), if a value is present;
   2.  From corresponding env var, if any;
   3.  The default value, if one was specified.

   If the fetched value is an empty string it is considered to be unset and this function returns `nil`."
  ^String [setting-or-name]
  (let [setting (resolve-setting setting-or-name)
        v       (or (db-value setting)
                    (env-var-value setting)
                    (:default setting))]
    (when (seq v)
      v)))

(defn- string->boolean [string-value]
  (when (seq string-value)
    (case (str/lower-case string-value)
      "true"  true
      "false" false
      (throw (Exception. "Invalid value for string: must be either \"true\" or \"false\" (case-insensitive).")))))

(defn get-boolean
  "Get boolean value of (presumably `:boolean`) SETTING-OR-NAME. This is the default getter for `:boolean` settings.
   Returns one of the following values:

   *  `nil`   if string value of SETTING-OR-NAME is unset (or empty)
   *  `true`  if *lowercased* string value of SETTING-OR-NAME is `true`
   *  `false` if *lowercased* string value of SETTING-OR-NAME is `false`."
  ^Boolean [setting-or-name]
  (string->boolean (get-string setting-or-name)))

(def ^:private default-getter-for-type
  {:string  get-string
   :boolean get-boolean})

(defn get
  "Fetch the value of SETTING-OR-NAME. What this means depends on the Setting's `:getter`; by default, this looks for first for a corresponding env var,
   then checks the cache, then returns the default value of the Setting, if any."
  [setting-or-name]
  ((:getter (resolve-setting setting-or-name))))


;;; ------------------------------------------------------------ set! ------------------------------------------------------------

(s/defn ^:always-validate set-string!
  "Set string value of SETTING-OR-NAME. A `nil` or empty NEW-VALUE can be passed to unset (i.e., delete) SETTING-OR-NAME."
  [setting-or-name, new-value :- (s/maybe s/Str)]
  (let [new-value    (when (seq new-value)
                       new-value)
        setting      (resolve-setting setting-or-name)
        setting-name (setting-name setting)]
    (restore-cache-if-needed!)
    ;; write to DB
    (cond
      (not new-value)                 (db/delete! Setting :key setting-name)
      ;; if there's a value in the cache then the row already exists in the DB; update that
      (contains? @cache setting-name) (db/update-where! Setting {:key setting-name}
                                        :value new-value)
      ;; if there's nothing in the cache then the row doesn't exist, insert a new one
      :else                           (db/insert! Setting
                                        :key  setting-name
                                        :value new-value))
    ;; update cached value
    (if new-value
      (swap! cache assoc  setting-name new-value)
      (swap! cache dissoc setting-name))
    new-value))

(defn set-boolean!
  "Set the value of boolean SETTING-OR-NAME. NEW-VALUE can be nil, a boolean, or a string representation of one, such as `\"true\"` or `\"false\"` (these strings are case-insensitive)."
  [setting-or-name new-value]
  (set-string! setting-or-name (if (string? new-value)
                                 (set-boolean! setting-or-name (string->boolean new-value))
                                 (case new-value
                                   true  "true"
                                   false "false"
                                   nil   nil))))

(def ^:private default-setter-for-type
  {:string  set-string!
   :boolean set-boolean!})

(defn set!
  "Set the value of SETTING-OR-NAME. What this means depends on the Setting's `:setter`; by default, this just updates the Settings cache and writes its value to the DB.

    (set :mandrill-api-key \"xyz123\")

   Style note: prefer using the setting directly instead:

     (mandrill-api-key \"xyz123\")"
  [setting-or-name new-value]
  ((:setter (resolve-setting setting-or-name)) new-value))


;;; ------------------------------------------------------------ register-setting! ------------------------------------------------------------

(defn register-setting!
  "Register a new `Setting` with a map of `SettingDefinition` attributes.
   This is used internally be `defsetting`; you shouldn't need to use it yourself."
  [{setting-name :name, setting-type :type, default :default, :as setting}]
  (u/prog1 (let [setting-type (s/validate Type (or setting-type :string))]
             (merge {:setting-name setting-name
                     :description  nil
                     :setting-type setting-type
                     :default      (when default
                                     (str default))
                     :getter       (partial (default-getter-for-type setting-type) setting-name)
                     :setter       (partial (default-setter-for-type setting-type) setting-name)
                     :internal?    false}
                    (dissoc setting :name :type :default)))
    (s/validate SettingDefinition <>)
    (swap! registered-settings assoc setting-name <>)))



;;; ------------------------------------------------------------ defsetting macro ------------------------------------------------------------

(defn metadata-for-setting-fn
  "Create metadata for the function automatically generated by `defsetting`."
  [{:keys [default setting-type], :as setting}]
  {:arglists '([] [new-value])
   :doc      (str (format "`%s` is a %s `Setting`. You can get its value by calling\n\n" (setting-name setting) (name setting-type))
                  (format  "    (%s)\n\n" (setting-name setting))
                  "and set its value by calling\n\n"
                  (format "    (%s <new-value>)\n\n" (setting-name setting))
                  (format "You can also set its value with the env var `%s`.\n" (env-var-name setting))
                  "Clear its value by calling\n\n"
                  (format "    (%s nil)\n\n" (setting-name setting))
                  (format "Its default value is `%s`." (if (nil? default)
                                                         "nil"
                                                         default)))})

(defn setting-fn
  "Create the automatically defined getter/setter function for settings defined by `defsetting`."
  [setting]
  (fn
    ([]
     (get setting))
    ([new-value]
     ;; need to qualify this or otherwise the reader gets this confused with the set! used for things like (set! *warn-on-reflection* true)
     ;; :refer-clojure :exclude doesn't seem to work in this case
     (metabase.models.setting/set! setting new-value))))

(defmacro defsetting
  "Defines a new `Setting` that will be added to the DB at some point in the future.
   Conveniently can be used as a getter/setter as well:

     (defsetting mandrill-api-key \"API key for Mandrill.\")
     (mandrill-api-key)           ; get the value
     (mandrill-api-key new-value) ; update the value
     (mandrill-api-key nil)       ; delete the value

   A setting can be set from the SuperAdmin page or via the corresponding env var,
   eg. `MB_MANDRILL_API_KEY` for the example above.

   You may optionally pass any of the OPTIONS below:

   *  `:default` - The default value of the setting. (default: `nil`)
   *  `:type` - Either `:string` (default) or `:boolean`. Non-string settings have special default getters and setters that automatically coerce values to the correct types.
   *  `:internal?` - This `Setting` is for internal use and shouldn't be exposed in the UI (i.e., not
                     returned by the corresponding endpoints). Default: `false`
   *  `:getter` - A custom getter fn, which takes no arguments. Overrides the default implementation.
   *  `:setter` - A custom setter fn, which takes a single argument. Overrides the default implementation."
  {:style/indent 1}
  [setting-symb description & {:as options}]
  {:pre [(symbol? setting-symb) (string? description)]}
  `(let [setting# (register-setting! (assoc ~options
                                       :name ~(keyword setting-symb)
                                       :description ~description))]
     (-> (def ~setting-symb (setting-fn setting#))
         (alter-meta! merge (metadata-for-setting-fn setting#)))))


;;; ------------------------------------------------------------ EXTRA UTIL FNS ------------------------------------------------------------

(defn set-many!
  "Set the value of several `Settings` at once.

    (set-all {:mandrill-api-key \"xyz123\", :another-setting \"ABC\"})"
  [settings]
  {:pre [(map? settings)]}
  (doseq [[k v] settings]
    (metabase.models.setting/set! k v))
  ;; TODO - This event is no longer neccessary or desirable. This is used in only a single place, to stop or restart the MetaBot when settings are updated;
  ;; this only works if the setting is updated via this specific function. Instead, we should define a custom setter for the relevant setting that additionally
  ;; performs the desired operations when the value is updated. This pattern is easier to understand, works no matter how the setting is changed, and doesn't run when
  ;; irrelevant changes (to other settings) are made.
  (events/publish-event :settings-update settings))


(defn- obfuscated-env-var-value
  "If SETTING was set via env var, return an obfuscated string like `USING $MB_MY_SETTING`.
   This is meant to be user-facing (it is shown in the admin panel settings page)."
  ^String [setting]
  (when (env-var-value setting)
    (format "Using $%s" (env-var-name setting))))

(defn all
  "Return a sequence of Settings maps, including value and description.
   (For security purposes, this doesn't return the value of a setting if it was set via env var)."
  []
  (for [[k setting] (sort-by first @registered-settings)
        :let        [v (get k)]]
    {:key         k
     :value       (when (not= v (env-var-value setting))
                    v)
     :description (:description setting)
     :default     (or (obfuscated-env-var-value setting)
                      (:default setting))}))


(defn- settings-list
  "Return a list of all Settings (as created with `defsetting`).
   This excludes Settings created with the option `:internal?`."
  []
  (for [[k setting] @registered-settings
        :when       (not (:internal? setting))]
    {:key         k
     :description (:description setting)
     :default     (or (obfuscated-env-var-value setting)
                      (:default setting))}))
