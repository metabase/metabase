(ns metabase.models.setting.registry
  "Registry of all know Settings and [[register-setting!]] to validate and register a Setting."
  (:require
   [clojure.core :as core]
   [metabase.models.setting.definition :as setting.def]
   [metabase.models.setting.interface :as i]
   [schema.core :as s])
  (:import
   (clojure.lang Keyword Symbol)
   (java.time.temporal Temporal)))

(def ^:private retired-setting-names
  "A set of setting names which existed in previous versions of Metabase, but are no longer used. New settings may not use
  these names to avoid unintended side-effects if an application database still stores values for these settings."
  #{"-site-url"
    "enable-advanced-humanization"
    "metabot-enabled"
    "ldap-sync-admin-group"})

(def ^:dynamic *allow-retired-setting-names*
  "A dynamic val that controls whether it's allowed to use retired settings.
  Primarily used in test to disable retired setting check."
  false)

(defonce ^{:doc "Map of loaded defsettings"}
  registered-settings
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
        ;; not i18n'ed to avoid circular refs. Hopefully dev-facing-only anyway
        (throw (ex-info (format "Unknown setting: %s" (pr-str k))
                        {:registered-settings
                         (sort (keys @registered-settings))})))))

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

(def ^:private Type
  (s/pred (fn [a-type]
            (contains? (set (keys (methods default-tag-for-type))) a-type))
          "Valid Setting :type"))

(def ^:private Visibility
  (s/enum :public :authenticated :admin :internal))

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
   ;; Use `:doc` to include a map with additional documentation, for use when generating the environment variable docs
   ;; from source. To exclude a setting from documenation, set to `false`. See metabase.cmd.env-var-dox.
   :doc         s/Any
   :default     s/Any
   :type        Type             ; all values are stored in DB as Strings,
   :getter      clojure.lang.IFn ; different getters/setters take care of parsing/unparsing
   :setter      clojure.lang.IFn
   :tag         (s/maybe Symbol) ; type annotation, e.g. ^String, to be applied. Defaults to tag based on :type
   :sensitive?  s/Bool           ; is this sensitive (never show in plaintext), like a password? (default: false)
   :visibility  Visibility       ; where this setting should be visible (default: :admin)
   :cache?      s/Bool           ; should the getter always fetch this value "fresh" from the DB? (default: false)
   :deprecated  (s/maybe s/Str)            ; if non-nil, contains the Metabase version in which this setting was deprecated

   ;; whether this Setting can be Database-local or User-local. See [[metabase.models.setting]] docstring for more info.
   :database-local LocalOption
   :user-local     LocalOption

   ;; called whenever setting value changes, whether from update-setting! or a cache refresh. used to handle cases
   ;; where a change to the cache necessitates a change to some value outside the cache, like when a change the
   ;; `:site-locale` setting requires a call to `java.util.Locale/setDefault`
   :on-change   (s/maybe clojure.lang.IFn)

   ;; optional fn called whether to allow the getter to return a value. Useful for ensuring premium settings are not available to
   :enabled?    (s/maybe clojure.lang.IFn)})

(defn- default-getter-for-type [setting-type]
  (partial i/get-value-of-type (keyword setting-type)))

(defn- default-setter-for-type [setting-type]
  (partial i/set-value-of-type! (keyword setting-type)))

(defn- validate-default-value-for-type
  "Check whether the `:default` value of a Setting (if provided) agrees with the Setting's `:type` and its `:tag` (which
  usually comes from [[default-tag-for-type]])."
  [{:keys [tag default] :as _setting-definition}]
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

(defn register-setting!
  "Register a new Setting with a map of [[SettingDefinition]] attributes. Returns the map it was passed. This is used
  internally by [[defsetting]]; you shouldn't need to use it yourself."
  [{setting-name :name, setting-ns :namespace, setting-type :type, default :default, :as setting}]
  (let [munged-name (setting.def/munge-setting-name (name setting-name))
        setting-type (s/validate Type (or setting-type :string))
        setting-def (merge
                     {:name           setting-name
                      :munged-name    munged-name
                      :namespace      setting-ns
                      :description    nil
                      :doc            nil
                      :type           setting-type
                      :default        default
                      :on-change      nil
                      :getter         (partial (default-getter-for-type setting-type) setting-name)
                      :setter         (partial (default-setter-for-type setting-type) setting-name)
                      :tag            (default-tag-for-type setting-type)
                      :visibility     :admin
                      :sensitive?     false
                      :cache?         true
                      :database-local :never
                      :user-local     :never
                      :deprecated     nil
                      :enabled?       nil}
                     (dissoc setting :name :type :default))]
    (s/validate SettingDefinition setting-def)
    (validate-default-value-for-type setting-def)
    ;; The errors below are not i18n'ed because they're dev-facing-only
    ;;
    ;; eastwood complains about (setting-name @registered-settings) for shadowing the function `setting-name`
    (when-let [registered-setting (get @registered-settings setting-name)]
      (when (not= setting-ns (:namespace registered-setting))
        (throw (ex-info (format "Setting %s already registered in %s" setting-name (:namespace registered-setting))
                        {:existing-setting (dissoc registered-setting :on-change :getter :setter)}))))
    (when-let [same-munge (first (filter (comp #{munged-name} :munged-name)
                                         (vals @registered-settings)))]
      (when (not= setting-name (:name same-munge)) ;; redefinitions are fine
        (throw (ex-info (format "Setting names in would collide: %s and %s"
                                setting-name (:name same-munge))
                        {:existing-setting (dissoc same-munge :on-change :getter :setter)
                         :new-setting      (dissoc setting-def :on-change :getter :setter)}))))
    (when (and (retired-setting-names (name setting-name)) (not *allow-retired-setting-names*))
      (throw (ex-info (format "Setting name %s is retired; use a different name instead" (name setting-name))
                      {:retired-setting-name (name setting-name)
                       :new-setting          (dissoc setting-def :on-change :getter :setter)})))
    (when (and (setting.def/allows-user-local-values? setting) (setting.def/allows-database-local-values? setting))
      (throw (ex-info (format "Setting %s allows both user-local and database-local values; this is not supported"
                              setting-name)
                      {:setting setting})))
    (swap! registered-settings assoc setting-name setting-def)
    setting-def))
