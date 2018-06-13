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

       (setting/get :mandrill-api-key)           ; only returns values set explicitly from SuperAdmin
       (mandrill-api-key)                        ; returns value set in SuperAdmin, OR value of corresponding env var,
                                                 ; OR the default value, if any (in that order)

       (setting/set! :mandrill-api-key \"NEW_KEY\")
       (mandrill-api-key \"NEW_KEY\")

       (setting/set! :mandrill-api-key nil)
       (mandrill-api-key nil)

   Get a map of all Settings:

      (setting/all)"
  (:refer-clojure :exclude [get])
  (:require [cheshire.core :as json]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [environ.core :as env]
            [metabase
             [events :as events]
             [util :as u]]
            [puppetlabs.i18n.core :refer [tru]]
            [schema.core :as s]
            [toucan
             [db :as db]
             [models :as models]]))

(models/defmodel Setting
  "The model that underlies `defsetting`."
  :setting)

(u/strict-extend (class Setting)
  models/IModel
  (merge models/IModelDefaults
         {:types (constantly {:value :clob})}))


(def ^:private Type
  (s/enum :string :boolean :json :integer :double))

(def ^:private SettingDefinition
  {:name        s/Keyword
   :description s/Str            ; used for docstring and is user-facing in the admin panel
   :default     s/Any
   :type        Type             ; all values are stored in DB as Strings,
   :getter      clojure.lang.IFn ; different getters/setters take care of parsing/unparsing
   :setter      clojure.lang.IFn
   :internal?   s/Bool})         ; should the API never return this setting? (default: false)


(defonce ^:private registered-settings
  (atom {}))

(s/defn ^:private resolve-setting :- SettingDefinition
  [setting-or-name]
  (if (map? setting-or-name)
    setting-or-name
    (let [k (keyword setting-or-name)]
      (or (@registered-settings k)
          (throw (Exception. (str (tru "Setting {0} does not exist.\nFound: {1}" k (sort (keys @registered-settings))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     cache                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Cache is a 1:1 mapping of what's in the DB
;; Cached lookup time is ~60µs, compared to ~1800µs for DB lookup

(defonce ^:private cache
  (atom nil))

(defn- restore-cache-if-needed! []
  (when-not @cache
    (reset! cache (db/select-field->field :key :value Setting))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                      get                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- setting-name ^String [setting-or-name]
  (name (:name (resolve-setting setting-or-name))))

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
                    (str (:default setting)))]
    (when (seq v)
      v)))

(defn- string->boolean [string-value]
  (when (seq string-value)
    (case (str/lower-case string-value)
      "true"  true
      "false" false
      (throw (Exception. (str (tru "Invalid value for string: must be either \"true\" or \"false\" (case-insensitive).")))))))

(defn get-boolean
  "Get boolean value of (presumably `:boolean`) SETTING-OR-NAME. This is the default getter for `:boolean` settings.
   Returns one of the following values:

   *  `nil`   if string value of SETTING-OR-NAME is unset (or empty)
   *  `true`  if *lowercased* string value of SETTING-OR-NAME is `true`
   *  `false` if *lowercased* string value of SETTING-OR-NAME is `false`."
  ^Boolean [setting-or-name]
  (string->boolean (get-string setting-or-name)))

(defn get-integer
  "Get integer value of (presumably `:integer`) SETTING-OR-NAME. This is the default getter for `:integer` settings."
  ^Integer [setting-or-name]
  (when-let [s (get-string setting-or-name)]
    (Integer/parseInt s)))

(defn get-double
  "Get double value of (presumably `:double`) SETTING-OR-NAME. This is the default getter for `:double` settings."
  ^Double [setting-or-name]
  (when-let [s (get-string setting-or-name)]
    (Double/parseDouble s)))

(defn get-json
  "Get the string value of SETTING-OR-NAME and parse it as JSON."
  [setting-or-name]
  (json/parse-string (get-string setting-or-name) keyword))

(def ^:private default-getter-for-type
  {:string  get-string
   :boolean get-boolean
   :integer get-integer
   :json    get-json
   :double  get-double})

(defn get
  "Fetch the value of SETTING-OR-NAME. What this means depends on the Setting's `:getter`; by default, this looks for
   first for a corresponding env var, then checks the cache, then returns the default value of the Setting, if any."
  [setting-or-name]
  ((:getter (resolve-setting setting-or-name))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                      set!                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- update-setting! [setting-name new-value]
  (db/update-where! Setting {:key setting-name}
    :value new-value))

(defn- set-new-setting!
  "Insert a new row for a Setting with SETTING-NAME and SETTING-VALUE.
   Takes care of resetting the cache if the insert fails for some reason."
  [setting-name new-value]
  (try (db/insert! Setting
         :key   setting-name
         :value new-value)
       ;; if for some reason inserting the new value fails it almost certainly means the cache is out of date
       ;; and there's actually a row in the DB that's not in the cache for some reason. Go ahead and update the
       ;; existing value and log a warning
       (catch Throwable e
         (log/warn "Error INSERTing a new Setting:" (.getMessage e)
                   "\nAssuming Setting already exists in DB and updating existing value.")
         (update-setting! setting-name new-value))))

(s/defn set-string!
  "Set string value of SETTING-OR-NAME. A `nil` or empty NEW-VALUE can be passed to unset (i.e., delete)
   SETTING-OR-NAME."
  [setting-or-name, new-value :- (s/maybe s/Str)]
  (let [new-value    (when (seq new-value)
                       new-value)
        setting      (resolve-setting setting-or-name)
        setting-name (setting-name setting)]
    (restore-cache-if-needed!)
    ;; write to DB
    (cond
      (not new-value)                 (db/simple-delete! Setting :key setting-name)
      ;; if there's a value in the cache then the row already exists in the DB; update that
      (contains? @cache setting-name) (update-setting! setting-name new-value)
      ;; if there's nothing in the cache then the row doesn't exist, insert a new one
      :else                           (set-new-setting! setting-name new-value))
    ;; update cached value
    (if new-value
      (swap! cache assoc  setting-name new-value)
      (swap! cache dissoc setting-name))
    new-value))

(defn set-boolean!
  "Set the value of boolean SETTING-OR-NAME. NEW-VALUE can be nil, a boolean, or a string representation of one, such
   as `\"true\"` or `\"false\"` (these strings are case-insensitive)."
  [setting-or-name new-value]
  (set-string! setting-or-name (if (string? new-value)
                                 (set-boolean! setting-or-name (string->boolean new-value))
                                 (case new-value
                                   true  "true"
                                   false "false"
                                   nil   nil))))

(defn set-integer!
  "Set the value of integer SETTING-OR-NAME."
  [setting-or-name new-value]
  (set-string! setting-or-name (when new-value
                                 (assert (or (integer? new-value)
                                             (and (string? new-value)
                                                  (re-matches #"^\d+$" new-value))))
                                 (str new-value))))

(defn set-double!
  "Set the value of double SETTING-OR-NAME."
  [setting-or-name new-value]
  (set-string! setting-or-name (when new-value
                                 (assert (or (float? new-value)
                                             (and (string? new-value)
                                                  (re-matches #"[+-]?([0-9]*[.])?[0-9]+" new-value) )))
                                 (str new-value))))

(defn set-json!
  "Serialize NEW-VALUE for SETTING-OR-NAME as a JSON string and save it."
  [setting-or-name new-value]
  (set-string! setting-or-name (when new-value
                                 (json/generate-string new-value))))

(def ^:private default-setter-for-type
  {:string  set-string!
   :boolean set-boolean!
   :integer set-integer!
   :json    set-json!
   :double  set-double!})

(defn set!
  "Set the value of SETTING-OR-NAME. What this means depends on the Setting's `:setter`; by default, this just updates
   the Settings cache and writes its value to the DB.

    (set :mandrill-api-key \"xyz123\")

   Style note: prefer using the setting directly instead:

     (mandrill-api-key \"xyz123\")"
  [setting-or-name new-value]
  ((:setter (resolve-setting setting-or-name)) new-value))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               register-setting!                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn register-setting!
  "Register a new `Setting` with a map of `SettingDefinition` attributes.
   This is used internally be `defsetting`; you shouldn't need to use it yourself."
  [{setting-name :name, setting-type :type, default :default, :as setting}]
  (u/prog1 (let [setting-type (s/validate Type (or setting-type :string))]
             (merge {:name        setting-name
                     :description nil
                     :type        setting-type
                     :default     default
                     :getter      (partial (default-getter-for-type setting-type) setting-name)
                     :setter      (partial (default-setter-for-type setting-type) setting-name)
                     :internal?   false}
                    (dissoc setting :name :type :default)))
    (s/validate SettingDefinition <>)
    (swap! registered-settings assoc setting-name <>)))



;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                defsetting macro                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn metadata-for-setting-fn
  "Create metadata for the function automatically generated by `defsetting`."
  [{:keys [default description], setting-type :type, :as setting}]
  {:arglists '([] [new-value])
   ;; indentation below is intentional to make it clearer what shape the generated documentation is going to take.
   ;; Turn on auto-complete-mode in Emacs and see for yourself!
   :doc (str/join "\n" [        description
                                ""
                        (format "`%s` is a %s `Setting`. You can get its value by calling:" (setting-name setting) (name setting-type))
                                ""
                        (format "    (%s)"                                                  (setting-name setting))
                                ""
                                "and set its value by calling:"
                                ""
                        (format "    (%s <new-value>)"                                      (setting-name setting))
                                ""
                        (format "You can also set its value with the env var `%s`."         (env-var-name setting))
                                ""
                                "Clear its value by calling:"
                                ""
                        (format "    (%s nil)"                                              (setting-name setting))
                                ""
                        (format "Its default value is `%s`."                                (if (nil? default) "nil" default))])})



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

(defmacro defsetting
  "Defines a new `Setting` that will be added to the DB at some point in the future.
   Conveniently can be used as a getter/setter as well:

     (defsetting mandrill-api-key \"API key for Mandrill.\")
     (mandrill-api-key)           ; get the value
     (mandrill-api-key new-value) ; update the value
     (mandrill-api-key nil)       ; delete the value

   A setting can be set from the SuperAdmin page or via the corresponding env var, eg. `MB_MANDRILL_API_KEY` for the
   example above.

   You may optionally pass any of the OPTIONS below:

   *  `:default`   - The default value of the setting. (default: `nil`)
   *  `:type`      - `:string` (default), `:boolean`, `:integer`, or `:json`. Non-`:string` settings have special
                     default getters and setters that automatically coerce values to the correct types.
   *  `:internal?` - This `Setting` is for internal use and shouldn't be exposed in the UI (i.e., not returned by the
                      corresponding endpoints). Default: `false`
   *  `:getter`    - A custom getter fn, which takes no arguments. Overrides the default implementation. (This can in
                     turn call functions in this namespace like `get-string` or `get-boolean` to invoke the default
                     getter behavior.)
   *  `:setter`    - A custom setter fn, which takes a single argument. Overrides the default implementation. (This
                     can in turn call functions in this namespace like `set-string!` or `set-boolean!` to invoke the
                     default setter behavior. Keep in mind that the custom setter may be passed `nil`, which should
                     clear the values of the Setting.)"
  {:style/indent 1}
  [setting-symb description & {:as options}]
  {:pre [(symbol? setting-symb)]}
  `(let [setting# (register-setting! (assoc ~options
                                       :name ~(keyword setting-symb)
                                       :description ~description))]
     (-> (def ~setting-symb (setting-fn setting#))
         (alter-meta! merge (metadata-for-setting-fn setting#)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 EXTRA UTIL FNS                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn set-many!
  "Set the value of several `Settings` at once.

    (set-all {:mandrill-api-key \"xyz123\", :another-setting \"ABC\"})"
  [settings]
  {:pre [(map? settings)]}
  (doseq [[k v] settings]
    (metabase.models.setting/set! k v))
  ;; TODO - This event is no longer neccessary or desirable. This is used in only a single place, to stop or restart
  ;; the MetaBot when settings are updated ; this only works if the setting is updated via this specific function.
  ;; Instead, we should define a custom setter for the relevant setting that additionally performs the desired
  ;; operations when the value is updated. This pattern is easier to understand, works no matter how the setting is
  ;; changed, and doesn't run when irrelevant changes (to other settings) are made.
  (events/publish-event! :settings-update settings))


(defn- user-facing-info [setting]
  (let [k         (:name setting)
        v         (get k)
        env-value (env-var-value setting)]
    {:key            k
     :value          (when (and (not= v env-value)
                                (not= v (:default setting)))
                       v)
     :is_env_setting (boolean env-value)
     :env_name       (env-var-name setting)
     :description    (:description setting)
     :default        (or (when env-value
                           (format "Using $%s" (env-var-name setting)))
                         (:default setting))}))

(defn all
  "Return a sequence of Settings maps in a format suitable for consumption by the frontend.
   (For security purposes, this doesn't return the value of a setting if it was set via env var)."
  []
  (for [setting (sort-by :name (vals @registered-settings))]
    (user-facing-info setting)))
