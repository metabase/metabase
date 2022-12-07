(ns metabase.models.setting
  "Settings are a fast and simple way to create a setting that can be set from the admin page. They are saved to the
  application Database, but intelligently cached internally for super-fast lookups.

  Define a new Setting with [[metabase.models.setting.macros/defsetting]] (optionally supplying things like default
  value, type, or custom getters & setters):

    (defsetting mandrill-api-key \"API key for Mandrill\")

  The newly-defined Setting will automatically be made available to the frontend client depending on its [[Visibility]].

  You can also set the value via the corresponding env var, which looks like `MB_MANDRILL_API_KEY`, where the name of
  the Setting is converted to uppercase and dashes to underscores.

  The var created with [[metabase.models.setting.macros/defsetting]] can be used as a getter/setter, or you can
  use [[get]] and [[set!]]:

    (require '[metabase.models.setting :as setting])

    (setting/get :mandrill-api-key) ; only returns values set explicitly from the Admin Panel
    (mandrill-api-key)              ; returns value set in the Admin Panel, OR value of corresponding env var,
                                    ; OR the default value, if any (in that order)

    (setting/set! :mandrill-api-key \"NEW_KEY\")
    (mandrill-api-key! \"NEW_KEY\")

    (setting/set! :mandrill-api-key nil)
    (mandrill-api-key! nil)

  You can define additional Settings types adding implementations
  of [[metabase.models.setting.registry/default-tag-for-type]], [[metabase.models.setting.interface/get-value-of-type]],
  and [[metabase.models.setting.interface/set-value-of-type!]].

  [[admin-writable-settings]] and [[user-readable-values-map]] can be used to fetch *all* Admin-writable and
  User-readable Settings, respectively. See their docstrings for more information.

  ### User-local and Database-local Settings

  Starting in 0.42.0, some Settings are allowed to have Database-specific values that override the normal site-wide
  value. Similarly, starting in 0.43.0, some Settings are allowed to have User-specific values. These are similar in
  concept to buffer-local variables in Emacs Lisp.

  When a Setting is allowed to be User or Database local, any values in [[*user-local-values*]] or
  [[*database-local-values*]] for that Setting will be returned preferentially to site-wide values of that Setting.
  [[*user-local-values*]] comes from the `User.settings` column in the application DB, and [[*database-local-values*]]
  comes from the `Database.settings` column. `nil` values in [[*user-local-values*]] and [[*database-local-values*]]
  are ignored, i.e. you cannot 'unset' a site-wide value with a User- or Database-local one.

  Whether or not a Setting can be User- or Database-local is controlled by the `:user-local` and `:database-local`
  options passed to [[defsetting]]. A Setting can only be User-local *or* Database-local, not both; this is enforced
  when the Setting is defined. There are three valid values of these options:

  * `:only` means this Setting can *only* have a User- or Database-local value and cannot have a 'normal' site-wide
  value. It cannot be set via env var. Default values are still allowed for User- and Database-local-only Settings.
  User- and Database-local-only Settings are never returned by [[admin-writable-settings]] or
  [[user-readable-values-map]] regardless of their [[Visibility]].

  * `:allowed` means this Setting can be User- or Database-local and can also have a normal site-wide value; if both
  are specified, the User- or Database-specific value will be returned preferentially when we are in the context of a
  specific User or Database (i.e., [[*user-local-values*]] or [[*database-local-values*]] is bound).

  * `:never` means User- or Database-specific values cannot be set for this Setting. Values in [[*user-local-values*]]
  and [[*database-local-values*]] will be ignored.

  `:never` is the default value of both `:user-local` and `:database-local`; to allow User- or Database-local values,
  the Setting definition must explicitly specify `:only` or `:allowed` for the appropriate option.

  If a User-local setting is written in the context of an API request (i.e., when [[metabase.api.common/*current-user*]]
  is bound), the value will be local to the current user. If it is written outside of an API request, a site-wide
  value will be written. (At the time of this writing, there is not yet a FE-client-friendly way to set Database-local
  values. Just set them manually in the application DB until we figure that out.)

  Custom setter functions do not affect User- or Database-local values; they always set the site-wide value.

  See #14055 and #19399 for more information about and motivation behind User- and Database-local Settings."
  (:refer-clojure :exclude [get])
  (:require
   [cheshire.core :as json]
   [clojure.core :as core]
   [clojure.data :as data]
   [clojure.data.csv :as csv]
   [clojure.string :as str]
   [clojure.tools.logging :as log]
   [environ.core :as env]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.models.serialization.base :as serdes.base]
   [metabase.models.serialization.hash :as serdes.hash]
   [metabase.models.setting.cache :as setting.cache]
   [metabase.models.setting.definition :as setting.def]
   [metabase.models.setting.interface :as setting.i]
   [metabase.models.setting.macros :as setting.macros]
   [metabase.models.setting.registry :as setting.registry]
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [deferred-tru trs tru]]
   [potemkin :as p]
   [schema.core :as s]
   [toucan.db :as db]
   [toucan.models :as models])
  (:import
   (java.io StringWriter)
   (java.time.temporal Temporal)))

(comment setting.macros/keep-me)

;;; TODO -- an easy way to SET Database-local values.
(def ^:dynamic *database-local-values*
  "Database-local Settings values (as a map of Setting name -> already-deserialized value). This comes from the value of
  `Database.settings` in the application DB. When bound, any Setting that *can* be Database-local will have a value
  from this map returned preferentially to the site-wide value.

  This is normally bound automatically in Query Processor context
  by [[metabase.query-processor.middleware.resolve-database-and-driver]]. You may need to manually bind it in other
  places where you want to use Database-local values.

  TODO -- we should probably also bind this in sync contexts e.g. functions in [[metabase.sync]]."
  nil)

(def ^:dynamic *user-local-values*
  "User-local Settings values (as a map of Setting name -> already-deserialized value). This comes from the value of
  `User.settings` in the application DB. When bound, any Setting that *can* be User-local will have a value from this
  map returned preferentially to the site-wide value.

  This is a delay so that the settings for a user are loaded only if and when they are actually needed during a given
  API request.

  This is normally bound automatically by session middleware, in
  [[metabase.server.middleware.session/do-with-current-user]]."
  (delay (atom nil)))


(models/defmodel Setting
  "The model that underlies [[defsetting]]."
  :setting)

(u/strict-extend #_{:clj-kondo/ignore [:metabase/disallow-class-or-type-on-model]} (class Setting)
  models/IModel
  (merge models/IModelDefaults
         {:types       (constantly {:value :encrypted-text})
          :primary-key (constantly :key)}))

(defmethod serdes.hash/identity-hash-fields Setting
  [_setting]
  [:key])

(declare admin-writable-site-wide-settings)

(defmethod serdes.base/extract-all "Setting" [_model _opts]
  (for [{:keys [key value]} (admin-writable-site-wide-settings
                             :getter (partial setting.i/get-value-of-type :string))]
    {:serdes/meta [{:model "Setting" :id (name key)}]
     :key key
     :value value}))

(defmethod serdes.base/load-find-local "Setting" [[{:keys [id]}]]
  (setting.i/get-value-of-type :string (keyword id)))

(defmethod serdes.base/load-one! "Setting" [{:keys [key value]} _]
  (setting.i/set-value-of-type! :string key value))

;; The actual watch that triggers this happens in [[metabase.models.setting.cache/cache*]] because the cache might be
;; swapped out depending on which app DB we have in play
;;
;; this isn't really something that needs to be a multimethod, but I'm using it because the logic can't really live in
;; [[metabase.models.setting.cache]] but the cache has to live here; this is a good enough way to prevent circular
;; references for now
(defmethod setting.cache/call-on-change :default
  [old new]
  (let [rs      @setting.registry/registered-settings
        [d1 d2] (data/diff old new)]
    (doseq [changed-setting (into (set (keys d1))
                                  (set (keys d2)))]
      (when-let [on-change (get-in rs [(keyword changed-setting) :on-change])]
        (on-change (clojure.core/get old changed-setting) (clojure.core/get new changed-setting))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                      get                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- database-local-value [setting-definition-or-name]
  (let [{setting-name :name, :as setting} (setting.registry/resolve-setting setting-definition-or-name)]
    (when (setting.def/allows-database-local-values? setting)
      (core/get *database-local-values* setting-name))))

(defn- user-local-value [setting-definition-or-name]
  (let [{setting-name :name, :as setting} (setting.registry/resolve-setting setting-definition-or-name)]
    (when (setting.def/allows-user-local-values? setting)
      (core/get @@*user-local-values* setting-name))))

(defn- should-set-user-local-value? [setting-definition-or-name]
  (let [setting (setting.registry/resolve-setting setting-definition-or-name)]
    (and (setting.def/allows-user-local-values? setting)
         @@*user-local-values*)))

(defn- set-user-local-value! [setting-definition-or-name value]
  (let [{setting-name :name} (setting.registry/resolve-setting setting-definition-or-name)]
    ;; Update the atom in *user-local-values* with the new value before writing to the DB. This ensures that
    ;; subsequent setting updates within the same API request will not overwrite this value.
    (swap! @*user-local-values*
           (fn [old-settings] (if value
                                (assoc old-settings setting-name value)
                                (dissoc old-settings setting-name))))
    (db/update! 'User api/*current-user-id* {:settings (json/generate-string @@*user-local-values*)})))

(def ^:dynamic *enforce-setting-access-checks*
  "A dynamic var that controls whether we should enforce checks on setting access. Defaults to false; should be
  set to true when settings are being written directly via /api/setting endpoints."
  false)

(defn- has-advanced-setting-access?
  "If `advanced-permissions` is enabled, check if current user has permissions to edit `setting`.
  Return `false` when `advanced-permissions` is disabled."
  []
  (u/ignore-exceptions
   (classloader/require 'metabase-enterprise.advanced-permissions.common
                        'metabase.public-settings.premium-features))
  (if-let [current-user-has-application-permisisons?
           (and ((resolve 'metabase.public-settings.premium-features/enable-advanced-permissions?))
                (resolve 'metabase-enterprise.advanced-permissions.common/current-user-has-application-permissions?))]
    (current-user-has-application-permisisons? :setting)
    false))

(defn- current-user-can-access-setting?
  "This checks whether the current user should have the ability to read or write the provided setting.

  By default this function always returns `true`, but setting access control can be turned on the dynamic var
  `*enforce-setting-access-checks*`. This is because this enforcement is only necessary when settings are being
  accessed directly via the API, but not in most other places on the backend."
  [setting]
  (or (not *enforce-setting-access-checks*)
      (nil? api/*current-user-id*)
      api/*is-superuser?*
      (has-advanced-setting-access?)
      (and
       (setting.def/allows-user-local-values? setting)
       (not= (:visibility setting) :admin))))

(defn env-var-value
  "Get the value of `setting-definition-or-name` from the corresponding env var, if any.
   The name of the Setting is converted to uppercase and dashes to underscores; for example, a setting named
  `default-domain` can be set with the env var `MB_DEFAULT_DOMAIN`. Note that this strips out characters that are not
  legal for shells. Setting `foo-bar?` will expect to find the key `:mb-foo-bar` which will be sourced from the
  environment variable `MB_FOO_BAR`."
  ^String [setting-definition-or-name]
  (let [setting (setting.registry/resolve-setting setting-definition-or-name)]
    (when (setting.def/allows-site-wide-values? setting)
      (let [v (env/env (keyword (str "mb-" (setting.def/munge-setting-name (setting.def/setting-name setting)))))]
        (when (seq v)
          v)))))

(def ^:private ^:dynamic *disable-cache* false)

(defn- db-or-cache-value
  "Get the value, if any, of `setting-definition-or-name` from the DB (using / restoring the cache as needed)."
  ^String [setting-definition-or-name]
  (let [setting       (setting.registry/resolve-setting setting-definition-or-name)
        db-is-set-up? (or (requiring-resolve 'metabase.db/db-is-set-up?)
                          ;; this should never be hit. it is just overly cautious against a NPE here. But no way this
                          ;; cannot resolve
                          (constantly false))]
    ;; cannot use db (and cache populated from db) if db is not set up
    (when (and (db-is-set-up?) (setting.def/allows-site-wide-values? setting))
      (let [v (if *disable-cache*
                (db/select-one-field :value Setting :key (setting.def/setting-name setting-definition-or-name))
                (do
                  (setting.cache/restore-cache-if-needed!)
                  (let [cache (setting.cache/cache)]
                    (if (nil? cache)
                      ;; If another thread is populating the cache for the first time, we will have a nil value for
                      ;; the cache and must hit the db while the cache populates
                      (db/select-one-field :value Setting :key (setting.def/setting-name setting-definition-or-name))
                      (clojure.core/get cache (setting.def/setting-name setting-definition-or-name))))))]
        (not-empty v)))))

(defn default-value
  "Get the `:default` value of `setting-definition-or-name` if one was specified."
  [setting-definition-or-name]
  (let [{:keys [default]} (setting.registry/resolve-setting setting-definition-or-name)]
    default))

(defn get-raw-value
  "Get the raw value of a Setting from wherever it may be specified. Value is fetched by trying the following sources in
  order:

  1. From [[*user-local-values*]] if this Setting is allowed to have User-local values
  2. From [[*database-local-values*]] if this Setting is allowed to have Database-local values
  3. From the corresponding env var (excluding empty string values)
  4. From the application database (i.e., set via the admin panel) (excluding empty string values)
  5. The default value, if one was specified

  !!!!!!!!!! The value returned MAY OR MAY NOT be a String depending on the source !!!!!!!!!!

  This is the underlying function powering all the other getters such as methods of [[setting.i/get-value-of-type]]. These
  getter functions *must* be coded to handle either String or non-String values. You can use the three-arity version
  of this function to do that.

  Three-arity version can be used to specify how to parse non-empty String values (`parse-fn`) and under what
  conditions values can be returned directly (`pred`) -- see [[setting.i/get-value-of-type]] for `:boolean` for example usage."
  ([setting-definition-or-name]
   (let [setting    (setting.registry/resolve-setting setting-definition-or-name)
         source-fns [user-local-value
                     database-local-value
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
                         (let [{setting-name :name} (setting.registry/resolve-setting setting-definition-or-name)]
                           (throw (ex-info (tru "Error parsing Setting {0}: {1}" setting-name (ex-message e))
                                           {:setting setting-name}
                                           e))))))
         raw-value (get-raw-value setting-definition-or-name)
         v         (cond-> raw-value
                     (string? raw-value) parse)]
     (when (pred v)
       v))))

(defmethod setting.i/get-value-of-type :string
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
(defmethod setting.i/get-value-of-type :boolean
  [_setting-type setting-definition-or-name]
  (get-raw-value setting-definition-or-name boolean? string->boolean))

(defmethod setting.i/get-value-of-type :integer
  [_setting-type setting-definition-or-name]
  (get-raw-value setting-definition-or-name integer? #(Long/parseLong ^String %)))

(defmethod setting.i/get-value-of-type :double
  [_setting-type setting-definition-or-name]
  (get-raw-value setting-definition-or-name double? #(Double/parseDouble ^String %)))

(defmethod setting.i/get-value-of-type :keyword
  [_setting-type setting-definition-or-name]
  (get-raw-value setting-definition-or-name keyword? keyword))

(defmethod setting.i/get-value-of-type :timestamp
  [_setting-type setting-definition-or-name]
  (get-raw-value setting-definition-or-name #(instance? Temporal %) u.date/parse))

(defmethod setting.i/get-value-of-type :json
  [_setting-type setting-definition-or-name]
  (get-raw-value setting-definition-or-name coll? #(json/parse-string % true)))

(defmethod setting.i/get-value-of-type :csv
  [_setting-type setting-definition-or-name]
  (get-raw-value setting-definition-or-name sequential? (comp first csv/read-csv)))

(defn get
  "Fetch the value of `setting-definition-or-name`. What this means depends on the Setting's `:getter`; by default, this
  looks for first for a corresponding env var, then checks the cache, then returns the default value of the Setting,
  if any."
  [setting-definition-or-name]
  (let [{:keys [cache? getter enabled? default]} (setting.registry/resolve-setting setting-definition-or-name)
        disable-cache?                           (not cache?)]
    (if (or (nil? enabled?) (enabled?))
      (if (= *disable-cache* disable-cache?)
        (getter)
        (binding [*disable-cache* disable-cache?]
          (getter)))
      default)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                      set!                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- update-setting!
  "Update an existing Setting. Used internally by [[setting.i/set-value-of-type!]] for `:string` below; do not use directly."
  [setting-name new-value]
  (assert (not= setting-name setting.cache/settings-last-updated-key)
    (tru "You cannot update `settings-last-updated` yourself! This is done automatically."))
  ;; This is indeed a very annoying way of having to do things, but `update-where!` doesn't call `pre-update` (in case
  ;; it updates thousands of objects). So we need to manually trigger `pre-update` behavior by calling `do-pre-update`
  ;; so that `value` can get encrypted if `MB_ENCRYPTION_SECRET_KEY` is in use. Then take that possibly-encrypted
  ;; value and pass that into `update-where!`.
  (let [{maybe-encrypted-new-value :value} (models/do-pre-update Setting {:value new-value})]
    (db/update-where! Setting {:key setting-name}
      :value maybe-encrypted-new-value)))

(defn- set-new-setting!
  "Insert a new row for a Setting. Used internally by [[setting.i/set-value-of-type!]] for `:string` below; do not use directly."
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

(s/defmethod setting.i/set-value-of-type! :string
  [_setting-type setting-definition-or-name new-value :- (s/maybe s/Str)]
  (let [new-value                         (when (seq new-value)
                                            new-value)
        {:keys [sensitive? deprecated]
         :as setting}                     (setting.registry/resolve-setting setting-definition-or-name)
        obfuscated?                       (and sensitive? (obfuscated-value? new-value))
        setting-name                      (setting.def/setting-name setting)]
    ;; if someone attempts to set a sensitive setting to an obfuscated value (probably via a misuse of the `set-many!`
    ;; function, setting values that have not changed), ignore the change. Log a message that we are ignoring it.
    (if obfuscated?
      (log/info (trs "Attempted to set Setting {0} to obfuscated value. Ignoring change." setting-name))
      (do
        (when (and deprecated (not (nil? new-value)))
          (log/warn (trs "Setting {0} is deprecated as of Metabase {1} and may be removed in a future version."
                         setting-name
                         deprecated)))
        (if (should-set-user-local-value? setting)
          ;; If this is user-local and this is being set in the context of an API call, we don't want to update the
          ;; site-wide value or write or read from the cache
          (set-user-local-value! setting-name new-value)
          (do
            ;; make sure we're not trying to set the value of a Database-local-only Setting
            (when-not (setting.def/allows-site-wide-values? setting)
              (throw (ex-info (tru "Site-wide values are not allowed for Setting {0}" (:name setting))
                              {:setting (:name setting)})))
            ;; always update the cache entirely when updating a Setting.
            (setting.cache/restore-cache!)
            ;; write to DB
            (cond
              (nil? new-value)
              (db/simple-delete! Setting :key setting-name)

              ;; if there's a value in the cache then the row already exists in the DB; update that
              (contains? (setting.cache/cache) setting-name)
              (update-setting! setting-name new-value)

              ;; if there's nothing in the cache then the row doesn't exist, insert a new one
              :else
              (set-new-setting! setting-name new-value))
            ;; update cached value
            (setting.cache/update-cache! setting-name new-value)
            ;; Record the fact that a Setting has been updated so eventaully other instances (if applicable) find out
            ;; about it (For Settings that don't use the Cache, don't update the `last-updated` value, because it will
            ;; cause other instances to do needless reloading of the cache from the DB)
            (when-not *disable-cache*
              (setting.cache/update-settings-last-updated!))))
        ;; Now return the `new-value`.
        new-value))))

(defmethod setting.i/set-value-of-type! :keyword
  [_setting-type setting-definition-or-name new-value]
  (setting.i/set-value-of-type!
   :string setting-definition-or-name
   (u/qualified-name new-value)))

(defmethod setting.i/set-value-of-type! :boolean
  [setting-type setting-definition-or-name new-value]
  (if (string? new-value)
    (setting.i/set-value-of-type! setting-type setting-definition-or-name (string->boolean new-value))
    (let [s (case new-value
              true  "true"
              false "false"
              nil   nil)]
      (setting.i/set-value-of-type! :string setting-definition-or-name s))))

(defmethod setting.i/set-value-of-type! :integer
  [_setting-type setting-definition-or-name new-value]
  (setting.i/set-value-of-type!
   :string setting-definition-or-name
   (when new-value
     (assert (or (integer? new-value)
                 (and (string? new-value)
                      (re-matches #"^-?\d+$" new-value))))
     (str new-value))))

(defmethod setting.i/set-value-of-type! :double
  [_setting-type setting-definition-or-name new-value]
  (setting.i/set-value-of-type!
   :string setting-definition-or-name
   (when new-value
     (assert (or (number? new-value)
                 (and (string? new-value)
                      (re-matches #"[+-]?([0-9]*[.])?[0-9]+" new-value))))
     (str new-value))))

(defmethod setting.i/set-value-of-type! :json
  [_setting-type setting-definition-or-name new-value]
  (setting.i/set-value-of-type!
   :string setting-definition-or-name
   (some-> new-value json/generate-string)))

(defmethod setting.i/set-value-of-type! :timestamp
  [_setting-type setting-definition-or-name new-value]
  (setting.i/set-value-of-type!
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

(defmethod setting.i/set-value-of-type! :csv
  [_setting-type setting-definition-or-name new-value]
  (setting.i/set-value-of-type! :string setting-definition-or-name (serialize-csv new-value)))

(defn set!
  "Set the value of `setting-definition-or-name`. What this means depends on the Setting's `:setter`; by default, this
  just updates the Settings cache and writes its value to the DB.

    (set :mandrill-api-key \"xyz123\")

  Style note: prefer using the setting directly instead:

    (mandrill-api-key \"xyz123\")"
  [setting-definition-or-name new-value]
  (let [{:keys [setter cache?], :as setting} (setting.registry/resolve-setting setting-definition-or-name)
        name                                 (setting.def/setting-name setting)]
    (when-not (current-user-can-access-setting? setting)
      (throw (ex-info (tru "You do not have access to the setting {0}" name) setting)))
    (when (= setter :none)
      (throw (UnsupportedOperationException. (tru "You cannot set {0}; it is a read-only setting." name))))
    (binding [*disable-cache* (not cache?)]
      (setter new-value))))

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
    settings
    (catch Throwable e
      (setting.cache/restore-cache!)
      (throw e))))

(defn obfuscate-value
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
  convert the setting to the appropriate type; you can use `(partial setting.i/get-value-of-type :string)` to get all string
  values of Settings, for example."
  [setting-definition-or-name & {:keys [getter], :or {getter get}}]
  (let [{:keys [sensitive? visibility default], k :name, :as setting} (setting.registry/resolve-setting setting-definition-or-name)
        unparsed-value                                                (setting.i/get-value-of-type :string k)
        parsed-value                                                  (getter k)
        ;; `default` and `env-var-value` are probably still in serialized form so compare
        value-is-default?                                             (= parsed-value default)
        value-is-from-env-var?                                        (some-> (env-var-value setting) (= unparsed-value))]
    (cond
      (not (current-user-can-access-setting? setting))
      (throw (ex-info (tru "You do not have access to the setting {0}" k) setting))

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
  [{:keys [default description], k :name, :as setting} & {:as options}]
  (let [set-via-env-var? (boolean (env-var-value setting))]
    {:key            k
     :value          (try
                       (m/mapply user-facing-value setting options)
                       (catch Throwable e
                         (log/error e (trs "Error fetching value of Setting"))))
     :is_env_setting set-via-env-var?
     :env_name       (setting.def/env-var-name setting)
     :description    (str description)
     :default        (if set-via-env-var?
                       (tru "Using value of env var {0}" (str \$ (setting.def/env-var-name setting)))
                       default)}))

(defn admin-writable-settings
  "Return a sequence of site-wide Settings maps in a format suitable for consumption by the frontend.
  (For security purposes, this doesn't return the value of a Setting if it was set via env var).

  `options` are passed to [[user-facing-value]].

  This is currently used by `GET /api/setting` ([[metabase.api.setting/GET_]]; admin-only; powers the Admin Settings
  page) so all admin-visible Settings should be included. We *do not* want to return env var values, since admins
  are not allowed to modify them."
  [& {:as options}]
  ;; ignore Database-local values, but not User-local values
  (binding [*database-local-values* nil]
    (into
     []
     (comp (filter (fn [setting]
                     (and (not= (:visibility setting) :internal)
                          (not= (:database-local setting) :only))))
           (map #(m/mapply user-facing-info % options)))
     (sort-by :name (vals @setting.registry/registered-settings)))))

(defn admin-writable-site-wide-settings
  "Returns a sequence of site-wide Settings maps, similar to [[admin-writable-settings]]. However, this function
  excludes User-local Settings in addition to Database-local Settings. Settings that are optionally user-local will
  be included with their site-wide value, if a site-wide value is set.

  `options` are passed to [[user-facing-value]].

  This is used in [[metabase-enterprise.serialization.dump/dump-settings]] to serialize site-wide Settings."
  [& {:as options}]
  ;; ignore User-local and Database-local values
  (binding [*user-local-values* (delay (atom nil))
            *database-local-values* nil]
    (into
     []
     (comp (filter (fn [setting]
                     (and (not= (:visibility setting) :internal)
                          (setting.def/allows-site-wide-values? setting))))
           (map #(m/mapply user-facing-info % options)))
     (sort-by :name (vals @setting.registry/registered-settings)))))

(defn user-readable-values-map
  "Returns Settings as a map of setting name -> site-wide value for a given [[Visibility]] e.g. `:public`.

  Settings marked `:sensitive?` (e.g. passwords) are excluded.

  The is currently used by `GET /api/session/properties` ([[metabase.api.session/GET_properties]]) and
  in [[metabase.server.routes.index/load-entrypoint-template]]. These are used as read-only sources of Settings for
  the frontend client. For that reason, these Settings *should* include values that come back from environment
  variables, *unless* they are marked `:sensitive?`."
  [visibility]
  ;; ignore Database-local values, but not User-local values
  (binding [*database-local-values* nil]
    (into
     {}
     (comp (filter (fn [[_setting-name setting]]
                     (and (not (:sensitive? setting))
                          (setting.def/allows-site-wide-values? setting)
                          (= (:visibility setting) visibility))))
           (map (fn [[setting-name]]
                  [setting-name (get setting-name)])))
     @setting.registry/registered-settings)))

;;; these are here as a convenience, since they lived here for basically forever.
(p/import-vars
 [setting.macros
  defsetting]
 [setting.i
  get-value-of-type
  set-value-of-type!])
