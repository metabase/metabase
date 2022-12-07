(ns metabase.models.setting.macros
  "The [[defendpoint]] macro and its implementation."
  (:require
   [clojure.core :as core]
   [clojure.string :as str]
   [metabase.models.setting.definition :as setting.def]
   [metabase.models.setting.interface :as setting.i]
   [metabase.models.setting.registry :as setting.registry]))

(defn- setting-fn-docstring [{:keys [default description], setting-type :type, :as setting}]
  ;; indentation below is intentional to make it clearer what shape the generated documentation is going to take.
  (str
   description \newline
   \newline
   (format "`%s` is a `%s` Setting. You can get its value by calling:\n" (setting.def/setting-name setting) setting-type)
   \newline
   (format "    (%s)\n"                                                  (setting.def/setting-name setting))
   \newline
   "and set its value by calling:\n"
   \newline
   (format "    (%s! <new-value>)\n"                                     (setting.def/setting-name setting))
   \newline
   (format "You can also set its value with the env var `%s`.\n"         (setting.def/env-var-name setting))
   \newline
   "Clear its value by calling:\n"
   \newline
   (format "    (%s! nil)\n"                                             (setting.def/setting-name setting))
   \newline
   (format "Its default value is `%s`."                                  (pr-str default))))

(defn setting-fn-metadata
  "Impl for [[defsetting]]. Create metadata for [[setting-fn]]."
  [getter-or-setter {:keys [tag deprecated], :as setting}]
  {:arglists   (case getter-or-setter
                 :getter (list (with-meta [] {:tag tag}))
                 :setter (list (with-meta '[new-value] {:tag tag})))
   :deprecated deprecated
   :doc        (setting-fn-docstring setting)})

(defn setting-fn
  "Impl for [[defsetting]]. Create the automatically defined `getter-or-setter` function for Settings defined
  by [[defsetting]]."
  [getter-or-setter setting]
  (case getter-or-setter
    :getter (fn setting-getter* []
              (setting.i/get-value-of-type (:type setting) setting))
    :setter (fn setting-setter* [new-value]
              ;; need to qualify this or otherwise the reader gets this confused with the set! used for things like
              ;; (set! *warn-on-reflection* true)
              ;; :refer-clojure :exclude doesn't seem to work in this case
              (setting.i/set-value-of-type! (:type setting) setting new-value))))

;;; The next few functions are for validating the Setting description (i.e., docstring) at macroexpansion time. They
;;; check that the docstring is a valid deferred i18n form (e.g. [[metabase.util.i18n/deferred-tru]]) so the Setting
;;; description will be localized properly when it shows up in the FE admin interface.

(def ^:private allowed-deferred-i18n-forms
  '#{metabase.util.i18n/deferred-trs metabase.util.i18n/deferred-tru})

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

(defn- validate-description-form
  "Check that `description-form` is a i18n form (e.g. [[metabase.util.i18n/deferred-tru]]). Returns `description-form`
  as-is."
  [description-form]
  (when-not (valid-trs-or-tru? description-form)
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
    (mandrill-api-key)            ; get the value
    (mandrill-api-key! new-value) ; update the value
    (mandrill-api-key! nil)       ; delete the value

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
  `:never`. See docstring for [[metabase.models.setting]] for more information.

  ###### `:user-local`

  Whether this Setting is /User-local/. Valid values are `:only`, `:allowed`, and `:never`. Default: `:never`. See
  docstring for [[metabase.models.setting]] for more info.

  ###### `:deprecated`

  If this setting is deprecated, this should contain a string of the Metabase version in which the setting was
  deprecated. A deprecation notice will be logged whenever the setting is written. (Default: `nil`).

  ###### `:on-change`

  Do you want to update something else when this setting changes? Takes a function which takes 2 arguments, `old`, and
  `new` and calls it with the old and new settings values. By default, the :on-change will be missing, and nothing
  will happen, in [[call-on-change]] below."
  {:style/indent 1}
  [setting-symbol description & {:as options}]
  {:pre [(symbol? setting-symbol)
         (not (namespace setting-symbol))
         ;; don't put exclamation points in your Setting names. We don't want functions like `exciting!` for the getter
         ;; and `exciting!!` for the setter.
         (not (str/includes? (name setting-symbol) "!"))]}
  (let [description               (if (or (= (:visibility options) :internal)
                                          (= (:setter options) :none))
                                    description
                                    (validate-description-form description))
        definition-form           (assoc options
                                         :name (keyword setting-symbol)
                                         :description description
                                         :namespace (list 'quote (ns-name *ns*)))
        ;; create symbols for the getter and setter functions e.g. `my-setting` and `my-setting!` respectively.
        ;; preserve metadata from the `setting-symbol` passed to `defsetting`.
        setting-getter-fn-symbol  setting-symbol
        setting-setter-fn-symbol  (-> (symbol (str (name setting-symbol) \!))
                                      (with-meta (meta setting-symbol)))
        ;; create a symbol for the Setting definition from [[register-setting!]]
        setting-definition-symbol (gensym "setting-")]
    `(let [~setting-definition-symbol (setting.registry/register-setting! ~definition-form)]
       (-> (def ~setting-getter-fn-symbol (setting-fn :getter ~setting-definition-symbol))
           (alter-meta! merge (setting-fn-metadata :getter ~setting-definition-symbol)))
       ~(when-not (= (:setter options) :none)
          `(-> (def ~setting-setter-fn-symbol (setting-fn :setter ~setting-definition-symbol))
               (alter-meta! merge (setting-fn-metadata :setter ~setting-definition-symbol)))))))
