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
            [clojure
             [core :as core]
             [string :as str]]
            [clojure.core.memoize :as memoize]
            [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [environ.core :as env]
            [honeysql.core :as hsql]
            [metabase
             [db :as mdb]
             [events :as events]
             [util :as u]]
            [metabase.util
             [date :as du]
             [honeysql-extensions :as hx]
             [i18n :as ui18n :refer [trs tru]]]
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
         {:types (constantly {:value :encrypted-text})}))


(def ^:private Type
  (s/enum :string :boolean :json :integer :double :timestamp))

(def ^:private default-tag-for-type
  "Type tag that will be included in the Setting's metadata, so that the getter function will not cause reflection
  warnings."
  {:string    String
   :boolean   Boolean
   :integer   Long
   :double    Double
   :timestamp java.sql.Timestamp})

(def ^:private SettingDefinition
  {:name        s/Keyword
   :description s/Any            ; description is validated via the macro, not schema
   :default     s/Any
   :type        Type             ; all values are stored in DB as Strings,
   :getter      clojure.lang.IFn ; different getters/setters take care of parsing/unparsing
   :setter      clojure.lang.IFn
   :tag         (s/maybe Class)  ; type annotation, e.g. ^String, to be applied. Defaults to tag based on :type
   :internal?   s/Bool           ; should the API never return this setting? (default: false)
   :cache?      s/Bool})         ; should the getter always fetch this value "fresh" from the DB? (default: false)


(defonce ^:private registered-settings
  (atom {}))

(s/defn ^:private resolve-setting :- SettingDefinition
  [setting-or-name]
  (if (map? setting-or-name)
    setting-or-name
    (let [k (keyword setting-or-name)]
      (or (@registered-settings k)
          (throw (Exception.
                  (str (tru "Setting {0} does not exist.\nFound: {1}" k (sort (keys @registered-settings))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     cache                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Cache is a 1:1 mapping of what's in the DB
;; Cached lookup time is ~60µs, compared to ~1800µs for DB lookup

(def ^:private cache
  "Settings cache. Map of Setting key (string) -> Setting value (string)."
  (atom nil))

;; CACHE SYNCHRONIZATION
;;
;; When running multiple Metabase instances (horizontal scaling), it is of course possible for one instance to update
;; a Setting, and, since Settings are cached (to avoid tons of DB calls), for the other instances to then have an
;; out-of-date cache. Thus we need a way for instances to know when their caches are out of date, so they can update
;; them accordingly. Here is our solution:
;;
;; We will record the last time *any* Setting was updated in a special Setting called `settings-last-updated`.
;;
;; Since `settings-last-updated` itself is a Setting, it will get fetched as part of each instance's local cache; we
;; can then periodically compare the locally cached value of `settings-last-updated` with the value in the DB. If our
;; locally cached value is older than the one in the DB, we will flush our cache. When the cache is fetched again, it
;; will have the up-to-date value.
;;
;; Because different machines can have out-of-sync clocks, we'll rely entirely on the application DB for caclulating
;; and comparing values of `settings-last-updated`. Because the Setting table itself only stores text values, we'll
;; need to cast it between TEXT and TIMESTAMP SQL types as needed.

(def ^:private ^String settings-last-updated-key "settings-last-updated")

(defn- update-settings-last-updated!
  "Update the value of `settings-last-updated` in the DB; if the row does not exist, insert one."
  []
  (log/debug (trs "Updating value of settings-last-updated in DB..."))
  ;; for MySQL, cast(current_timestamp AS char); for H2 & Postgres, cast(current_timestamp AS text)
  (let [current-timestamp-as-string-honeysql (hx/cast (if (= (mdb/db-type) :mysql) :char :text)
                                                      (hsql/raw "current_timestamp"))]
    ;; attempt to UPDATE the existing row. If no row exists, `update-where!` will return false...
    (or (db/update-where! Setting {:key settings-last-updated-key} :value current-timestamp-as-string-honeysql)
        ;; ...at which point we will try to INSERT a new row. Note that it is entirely possible two instances can both
        ;; try to INSERT it at the same time; one instance would fail because it would violate the PK constraint on
        ;; `key`, and throw a SQLException. As long as one instance updates the value, we are fine, so we can go ahead
        ;; and ignore that Exception if one is thrown.
        (try
          ;; Use `simple-insert!` because we do *not* want to trigger pre-insert behavior, such as encrypting `:value`
          (db/simple-insert! Setting :key settings-last-updated-key, :value current-timestamp-as-string-honeysql)
          (catch java.sql.SQLException e
            ;; go ahead and log the Exception anyway on the off chance that it *wasn't* just a race condition issue
            (log/error (trs "Error inserting a new Setting: {0}"
                            (with-out-str (jdbc/print-sql-exception-chain e))))))))
  ;; Now that we updated the value in the DB, go ahead and update our cached value as well, because we know about the
  ;; changes
  (swap! cache assoc settings-last-updated-key (db/select-one-field :value Setting :key settings-last-updated-key)))

(defn- cache-out-of-date?
  "Check whether our Settings cache is out of date. We know the cache is out of date if either of the following
  conditions is true:

   *  The cache is empty (the `cache` atom is `nil`), which of course means it needs to be updated
   *  There is a value of `settings-last-updated` in the cache, and it is older than the value of in the DB. (There
      will be no value until the first time a normal Setting is updated; thus if it is not yet set, we do not yet need
      to invalidate our cache.)"
  []
  (log/debug (trs "Checking whether settings cache is out of date (requires DB call)..."))
  (boolean
   (or
    ;; is the cache empty?
    (not @cache)
    ;; if not, get the cached value of `settings-last-updated`, and if it exists...
    (when-let [last-known-update (core/get @cache settings-last-updated-key)]
      ;; compare it to the value in the DB. This is done be seeing whether a row exists
      ;; WHERE value > <local-value>
      (u/prog1 (db/select-one Setting
                 {:where [:and
                          [:= :key settings-last-updated-key]
                          [:> :value last-known-update]]})
        (when <>
          (log/info (u/format-color 'red
                        (str (trs "Settings have been changed on another instance, and will be reloaded here."))))))))))

(def ^:private cache-update-check-interval-ms
  "How often we should check whether the Settings cache is out of date (which requires a DB call)?"
  ;; once a minute
  (* 60 1000))

(def ^:private ^{:arglists '([])} should-restore-cache?
  "TTL-memoized version of `cache-out-of-date?`. Call this function to see whether we need to repopulate the cache with
  values from the DB."
  (memoize/ttl cache-out-of-date? :ttl/threshold cache-update-check-interval-ms))

(def ^:private restore-cache-if-needed-lock (Object.))

(defn- restore-cache-if-needed!
  "Check whether we need to repopulate the cache with fresh values from the DB (because the cache is either empty or
  known to be out-of-date), and do so if needed. This is intended to be called every time a Setting value is
  retrieved, so it should be efficient; thus the calculation (`should-restore-cache?`) is itself TTL-memoized."
  []
  ;; There's a potential race condition here where two threads both call this at the exact same moment, and both get
  ;; `true` when they call `should-restore-cache`, and then both simultaneously try to update the cache (or, one
  ;; updates the cache, but the other calls `should-restore-cache?` and gets `true` before the other calls
  ;; `memo-swap!` (see below))
  ;;
  ;; This is not desirable, since either situation would result in duplicate work. Better to just add a quick lock
  ;; here so only one of them does it, since at any rate waiting for the other thread to finish the task in progress is
  ;; certainly quicker than starting the task ourselves from scratch
  (locking restore-cache-if-needed-lock
    (when (should-restore-cache?)
      (log/debug (trs "Refreshing Settings cache..."))
      (reset! cache (db/select-field->field :key :value Setting))
      ;; Now the cache is up-to-date. That is all good, but if we call `should-restore-cache?` again in a second it
      ;; will still return `true`, because its result is memoized, and we would be on the hook to (again) update the
      ;; cache. So go ahead and clear the memozied results for `should-restore-cache?`. The next time around when
      ;; someone calls this it will cache the latest value (which should be `false`)
      ;;
      ;; NOTE: I tried using `memo-swap!` instead to set the cached response to `false` here, avoiding the extra DB
      ;; call the next fn call would make, but it didn't seem to work correctly (I think it was still discarding the
      ;; new value because of the TTL). So we will just stick with `memo-clear!` for now. (One extra DB call whenever
      ;; the cache gets invalidated shouldn't be a huge deal)
      (memoize/memo-clear! should-restore-cache?))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                      get                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- setting-name ^String [setting-or-name]
  (name (:name (resolve-setting setting-or-name))))

(defn- env-var-name
  "Get the env var corresponding to `setting-or-name`.
   (This is used primarily for documentation purposes)."
  ^String [setting-or-name]
  (let [setting (resolve-setting setting-or-name)]
    (str "MB_" (str/upper-case (str/replace (setting-name setting) "-" "_")))))

(defn env-var-value
  "Get the value of `setting-or-name` from the corresponding env var, if any.
   The name of the Setting is converted to uppercase and dashes to underscores;
   for example, a setting named `default-domain` can be set with the env var `MB_DEFAULT_DOMAIN`."
  ^String [setting-or-name]
  (let [setting (resolve-setting setting-or-name)
        v       (env/env (keyword (str "mb-" (setting-name setting))))]
    (when (seq v)
      v)))

(def ^:private ^:dynamic *disable-cache* false)

(defn- db-value
  "Get the value, if any, of `setting-or-name` from the DB (using / restoring the cache as needed)."
  ^String [setting-or-name]
  (if *disable-cache*
    (db/select-one-field :value Setting :key (setting-name setting-or-name))
    (do
      (restore-cache-if-needed!)
      (clojure.core/get @cache (setting-name setting-or-name)))))


(defn get-string
  "Get string value of `setting-or-name`. This is the default getter for `String` settings; value is fetched as follows:

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
      (throw (Exception.
              (str (tru "Invalid value for string: must be either \"true\" or \"false\" (case-insensitive).")))))))

(defn get-boolean
  "Get boolean value of (presumably `:boolean`) `setting-or-name`. This is the default getter for `:boolean` settings.
   Returns one of the following values:

   *  `nil`   if string value of `setting-or-name` is unset (or empty)
   *  `true`  if *lowercased* string value of `setting-or-name` is `true`
   *  `false` if *lowercased* string value of `setting-or-name` is `false`."
  ^Boolean [setting-or-name]
  (string->boolean (get-string setting-or-name)))

(defn get-integer
  "Get integer value of (presumably `:integer`) `setting-or-name`. This is the default getter for `:integer` settings."
  ^Integer [setting-or-name]
  (when-let [s (get-string setting-or-name)]
    (Integer/parseInt s)))

(defn get-double
  "Get double value of (presumably `:double`) `setting-or-name`. This is the default getter for `:double` settings."
  ^Double [setting-or-name]
  (when-let [s (get-string setting-or-name)]
    (Double/parseDouble s)))

(defn get-json
  "Get the string value of `setting-or-name` and parse it as JSON."
  [setting-or-name]
  (json/parse-string (get-string setting-or-name) keyword))

(defn get-timestamp
  "Get the string value of `setting-or-name` and parse it as an ISO-8601-formatted string, returning a Timestamp."
  [setting-or-name]
  (du/->Timestamp (get-string setting-or-name) :no-timezone))

(def ^:private default-getter-for-type
  {:string    get-string
   :boolean   get-boolean
   :integer   get-integer
   :json      get-json
   :timestamp get-timestamp
   :double    get-double})

(defn get
  "Fetch the value of `setting-or-name`. What this means depends on the Setting's `:getter`; by default, this looks for
   first for a corresponding env var, then checks the cache, then returns the default value of the Setting, if any."
  [setting-or-name]
  (let [{:keys [cache? getter]} (resolve-setting setting-or-name)]
    (binding [*disable-cache* (not cache?)]
      (getter))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                      set!                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- update-setting!
  "Update an existing Setting. Used internally by `set-string!` below; do not use directly."
  [setting-name new-value]
  (assert (not= setting-name settings-last-updated-key)
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
         (log/warn (tru "Error inserting a new Setting:") "\n"
                   (.getMessage e) "\n"
                   (tru "Assuming Setting already exists in DB and updating existing value."))
         (update-setting! setting-name new-value))))

(s/defn set-string!
  "Set string value of `setting-or-name`. A `nil` or empty `new-value` can be passed to unset (i.e., delete)
  `setting-or-name`. String-type settings use this function directly; all other types ultimately call this (e.g.
  `set-boolean!` eventually calls `set-string!`). Returns the `new-value`."
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
    ;; Record the fact that a Setting has been updated so eventaully other instances (if applicable) find out about it
    ;; (For Settings that don't use the Cache, don't update the `last-updated` value, because it will cause other
    ;; instances to do needless reloading of the cache from the DB)
    (when-not *disable-cache*
      (update-settings-last-updated!))
    ;; Now return the `new-value`.
    new-value))

(defn set-boolean!
  "Set the value of boolean `setting-or-name`. `new-value` can be nil, a boolean, or a string representation of one,
  such as `\"true\"` or `\"false\"` (these strings are case-insensitive)."
  [setting-or-name new-value]
  (set-string! setting-or-name (if (string? new-value)
                                 (set-boolean! setting-or-name (string->boolean new-value))
                                 (case new-value
                                   true  "true"
                                   false "false"
                                   nil   nil))))

(defn set-integer!
  "Set the value of integer `setting-or-name`."
  [setting-or-name new-value]
  (set-string! setting-or-name (when new-value
                                 (assert (or (integer? new-value)
                                             (and (string? new-value)
                                                  (re-matches #"^\d+$" new-value))))
                                 (str new-value))))

(defn set-double!
  "Set the value of double `setting-or-name`."
  [setting-or-name new-value]
  (set-string! setting-or-name (when new-value
                                 (assert (or (float? new-value)
                                             (and (string? new-value)
                                                  (re-matches #"[+-]?([0-9]*[.])?[0-9]+" new-value) )))
                                 (str new-value))))

(defn set-json!
  "Serialize `new-value` for `setting-or-name` as a JSON string and save it."
  [setting-or-name new-value]
  (set-string! setting-or-name (some-> new-value json/generate-string)))

(defn set-timestamp!
  "Serialize `new-value` for `setting-or-name` as a ISO 8601-encoded timestamp strign and save it."
  [setting-or-name new-value]
  (set-string! setting-or-name (some-> new-value du/date->iso-8601)))

(def ^:private default-setter-for-type
  {:string    set-string!
   :boolean   set-boolean!
   :integer   set-integer!
   :json      set-json!
   :timestamp set-timestamp!
   :double    set-double!})

(defn set!
  "Set the value of `setting-or-name`. What this means depends on the Setting's `:setter`; by default, this just updates
   the Settings cache and writes its value to the DB.

    (set :mandrill-api-key \"xyz123\")

   Style note: prefer using the setting directly instead:

     (mandrill-api-key \"xyz123\")"
  [setting-or-name new-value]
  (let [{:keys [setter cache?]} (resolve-setting setting-or-name)]
    (binding [*disable-cache* (not cache?)]
      (setter new-value))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               register-setting!                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn register-setting!
  "Register a new Setting with a map of `SettingDefinition` attributes.
   This is used internally be `defsetting`; you shouldn't need to use it yourself."
  [{setting-name :name, setting-type :type, default :default, :as setting}]
  (u/prog1 (let [setting-type         (s/validate Type (or setting-type :string))]
             (merge {:name        setting-name
                     :description nil
                     :type        setting-type
                     :default     default
                     :getter      (partial (default-getter-for-type setting-type) setting-name)
                     :setter      (partial (default-setter-for-type setting-type) setting-name)
                     :tag         (default-tag-for-type setting-type)
                     :internal?   false
                     :cache?      true}
                    (dissoc setting :name :type :default)))
    (s/validate SettingDefinition <>)
    (swap! registered-settings assoc setting-name <>)))



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
   :doc (str/join "\n" [        description
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
                        (format "Its default value is `%s`."                              (if (nil? default) "nil" default))])})



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

(defn- expr-of-sym? [symbols expr]
  (when-let [first-sym (and (coll? expr)
                            (first expr))]
    (some #(= first-sym %) symbols)))

(defn- valid-trs-or-tru? [desc]
  (expr-of-sym? ['trs 'tru `trs `tru] desc))

(defn- valid-str-of-trs-or-tru? [maybe-str-expr]
  (when (expr-of-sym? ['str `str] maybe-str-expr)
    ;; When there are several i18n'd sentences, there will probably be a surrounding `str` invocation and a space in
    ;; between the sentences, remove those to validate the i18n clauses
    (let [exprs-without-strs (remove (every-pred string? str/blank?) (rest maybe-str-expr))]
      ;; We should have at lease 1 i18n clause, so ensure `exprs-without-strs` is not empty
      (and (seq exprs-without-strs)
           (every? valid-trs-or-tru? exprs-without-strs)))))

(defn- validate-description
  "Validates the description expression `desc-expr`, ensuring it contains an i18n form, or a string consisting of 1 or more i18n forms"
  [desc]
  (when-not (or (valid-trs-or-tru? desc)
                (valid-str-of-trs-or-tru? desc))
    (throw (IllegalArgumentException.
            (str (trs "defsetting descriptions strings must be `:internal?` or internationalized, found: `{0}`"
                      (pr-str desc))))))
  desc)

(defmacro defsetting
  "Defines a new Setting that will be added to the DB at some point in the future.
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
   *  `:internal?` - This Setting is for internal use and shouldn't be exposed in the UI (i.e., not returned by the
                      corresponding endpoints). Default: `false`
   *  `:getter`    - A custom getter fn, which takes no arguments. Overrides the default implementation. (This can in
                     turn call functions in this namespace like `get-string` or `get-boolean` to invoke the default
                     getter behavior.)
   *  `:setter`    - A custom setter fn, which takes a single argument. Overrides the default implementation. (This
                     can in turn call functions in this namespace like `set-string!` or `set-boolean!` to invoke the
                     default setter behavior. Keep in mind that the custom setter may be passed `nil`, which should
                     clear the values of the Setting.)
   *  `:cache?`    - Should this Setting be cached? (default `true`)? Be careful when disabling this, because it could
                     have a very negative performance impact."
  {:style/indent 1}
  [setting-symb description & {:as options}]
  {:pre [(symbol? setting-symb)]}
  `(let [desc# ~(if (:internal? options)
                  description
                  (validate-description description))
         setting# (register-setting! (assoc ~options
                                       :name ~(keyword setting-symb)
                                       :description desc#))]
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
     :description    (str (:description setting))
     :default        (or (when env-value
                           (format "Using $%s" (env-var-name setting)))
                         (:default setting))}))

(defn all
  "Return a sequence of Settings maps in a format suitable for consumption by the frontend.
   (For security purposes, this doesn't return the value of a setting if it was set via env var)."
  []
  (for [setting (sort-by :name (vals @registered-settings))]
    (user-facing-info setting)))
