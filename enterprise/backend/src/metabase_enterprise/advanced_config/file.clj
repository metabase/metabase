(ns ^{:added "0.45.0"} metabase-enterprise.advanced-config.file
  "Support for initializing Metabase with configuration from a `config.yml` file located in the current working
  directory. See https://github.com/metabase/metabase/issues/2052 for more information.

  This logic is meant to be executed after the application database is set up and driver plugins have been
  initialized.

  The config file itself is a YAML file containing a map where each key corresponds to a different init section. For
  example, it might look something like this:

    version: 1
    config:
      users:
        - first_name: Cam
          last_name: Saul
          password: 2cans
          email: cam@example.com
        - first_name: Cam
          last_name: Era
          password: 2cans
          email: cam.era@example.com
      databases:
        - type: postgres
          host: localhost
          port: 5432
          name: test-data
          password: {{ env MY_POSTGRES_PASSWORD }}
      settings:
        my-setting: 1234

  Each section is handled by its corresponding [[initialize-section!]] method; the shape of each section may vary.

  ### VERSIONING

  Config files are required to have a `version` key; each version of Metabase that supports config files (i.e., 45 and
  above) can support a range of config file versions, specified in [[*supported-versions*]].

  These are not semantic versions! They're just simple floating point version numbers. That should be enough for our
  purposes.

  The idea here is that if we want to make changes to the config file shape in the future we'll be able to do so
  without having older Metabase code suddenly break in mysterious ways because it doesn't understand the new config
  shape, or newer Metabase code breaking if you try to use a config file using the older shape.

  For the time being, the minimum version we'll support is 1.0, which is the initial version of the config spec that
  we're shipping with Metabase 45. We'll support all the way up to `1.999` (basically anything less than `2.0`). This
  will give us some room to define new backwards-compatible versions going forward.

  For example in Metabase 46 if we want to add some extra required keys that Metabase 45 can safely ignore, we can
  define a new version 1.1 of the spec and specify Metabase 46 works with config versions `1.1` to `1.999`.

  If we want to introduce a breaking change that should not be backwards-compatible, such as introducing a new
  template type, we can increment the major version to `2.0`.

  ### Spec validation

  The contents of each section are automatically validated against the [[section-spec]] for that section. This
  validation is done before template expansion to avoid leaking sensitive values in the error messages that get
  logged.

  ### Templates

  After spec validation, the config map is walked and `{{template}}` forms are expanded. This uses the same code used
  to parse template tags in SQL queries, i.e. [[metabase.driver.common.parameters.parse]], which means that
  `[[optional {{templates}}]]` work as well, if there is some reason you might need them.

  A template form like `{{env MY_ENV_VAR}}` is wrapped in parens and parsed as EDN, and then the result is passed
  to [[expand-parsed-template-form]], which dispatches off of the first form, as a symbol. e.g.

  ```
  {{env BIRD_TYPE}} => (expand-parsed-template-form '(env BIRD_TYPE)) => \"toucan\"
  ```

  At the time of this writing, `env` is the only supported template type; more can be added in the future as the need
  arises.

  #### `env`

  ```yaml
  {{env MY_ENV_VAR}}
  ```

  Replaces the template with the value of an environment variable. The template consisting of two parts: the word
  `env` and then the name of an environment variable. It uses [[environ.core/env]] under the hood, after passing the
  symbol thru [[csk/->kebab-case-keyword]]. This means it is case-insensitive and `lisp-case`/`snake_case`
  insensitive, and Java system properties are supported as well, provided you replace dots in their names with slashes
  or underscores. In other words, this works as well:

  ```yaml
  # Java system property user.dir
  {{env user-dir}}
  ```"
  (:require
   [clojure.edn :as edn]
   [clojure.spec.alpha :as s]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [environ.core :as env]
   [metabase-enterprise.advanced-config.file.databases]
   [metabase-enterprise.advanced-config.file.interface
    :as advanced-config.file.i]
   [metabase-enterprise.advanced-config.file.settings]
   [metabase-enterprise.advanced-config.file.users]
   [metabase.driver.common.parameters]
   [metabase.driver.common.parameters.parse :as params.parse]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.util :as u]
   [metabase.util.files :as u.files]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml]))

(comment
  ;; for parameter parsing
  metabase.driver.common.parameters/keep-me
  ;; for `settings:` section code
  metabase-enterprise.advanced-config.file.settings/keep-me
  ;; for `databases:` section code
  metabase-enterprise.advanced-config.file.databases/keep-me
  ;; for `users:` section code
  metabase-enterprise.advanced-config.file.users/keep-me)

(set! *warn-on-reflection* true)

(s/def :metabase.config.file.config/config
  (s/and
   map?
   (fn validate-section-configs [m]
     (doseq [[section-name section-config] m
             :let [spec (advanced-config.file.i/section-spec section-name)]]
       (s/assert* spec section-config))
     true)))

(def ^:private ^:dynamic *supported-versions*
  "Range of config file versions (inclusive) that we'll support. If the version is out of this range, spec validation
  will fail and trigger an error. See ns documentation for [[metabase.config.file]] for more details."
  {:min 1.0, :max 1.999})

(defn- supported-version? [n]
  (<= (:min *supported-versions*) n (:max *supported-versions*)))

(s/def :metabase.config.file.config/version
  (s/and number? supported-version?))

(s/def ::config
  (s/keys :req-un [:metabase.config.file.config/version
                   :metabase.config.file.config/config]))

(def ^:private ^:dynamic *env*
  "Environment variables and system properties used in this namespace. This is a dynamic version
  of [[environ.core/env]]; it is dynamic for test mocking purposes.

  Yes, [[metabase.test/with-temp-env-var-value!]] exists, but it is not allowed inside parallel tests. This is an
  experiment that I may adapt into a new pattern in the future to allow further test parallelization."
  env/env)

(defn- path
  "Path for the YAML config file Metabase should use for initialization and Settings values."
  ^java.nio.file.Path []
  (let [path* (or (some-> (get *env* :mb-config-file-path) u.files/get-path)
                  (u.files/get-path (System/getProperty "user.dir") "config.yml"))]
    (if (u.files/exists? path*)
      (log/info (u/format-color :magenta
                                "Found config file at path %s; Metabase will be initialized with values from this file"
                                (pr-str (str path*)))
                (u/emoji "🗄️"))
      (log/info (u/format-color :yellow "No config file found at path %s" (pr-str (str path*)))))
    path*))

(def ^:private ^:dynamic *config*
  "Override the config contents as returned by [[config]], for test mocking purposes."
  nil)

(defmulti ^:private expand-parsed-template-form
  {:arglists '([form])}
  (fn [form]
    (symbol (first form))))

(defmethod expand-parsed-template-form :default
  [form]
  (throw (ex-info (trs "Don''t know how to expand template form: {0}" (pr-str form))
                  {:form form})))

(defmethod expand-parsed-template-form 'env
  [[_template-type env-var-name]]
  (get *env* (keyword (u/->kebab-case-en env-var-name))))

(defmulti ^:private expand-template-str-part
  {:arglists '([part])}
  type)

(defmethod expand-template-str-part String
  [s]
  s)

(defn- valid-template-type? [symb]
  (and (symbol? symb)
       (get (methods expand-parsed-template-form) symb)))

(s/def ::template-form
  (s/or :env (s/cat :template-type (s/and symbol? valid-template-type?)
                    :env-var-name  symbol?)))

(defmethod expand-template-str-part metabase.driver.common.parameters.Param
  [{s :k}]
  {:pre [(string? s)]}
  (when (seq s)
    (when-let [obj (try
                     (not-empty (edn/read-string (str "( " s " )")))
                     (catch Throwable e
                       (throw (ex-info (trs "Error parsing template string {0}: {1}" (pr-str s) (ex-message e))
                                       {:template-string s}))))]
      (s/assert* ::template-form obj)
      (expand-parsed-template-form obj))))

(defmethod expand-template-str-part metabase.driver.common.parameters.Optional
  [{:keys [args]}]
  (let [parts (map expand-template-str-part args)]
    (when (every? seq parts)
      (str/join parts))))

(defn- expand-templates-in-str [s]
  (str/join (map expand-template-str-part (params.parse/parse s))))

(defn- expand-templates [m]
  (walk/postwalk
   (fn [form]
     (cond-> form
       (string? form) expand-templates-in-str))
   m))

(defn- config
  "Contents of the config file if it exists, otherwise `nil`. If config exists, it will be returned as a map."
  []
  (when-let [m (or *config*
                   (yaml/from-file (str (path))))]
    (s/assert* ::config m)
    (expand-templates m)))

(defn- sort-by-initialization-order
  "Sort the various config sections. The `:settings` section should always be applied first (important, since it can
  affect the other sections)."
  [config-sections]
  (let [{settings-sections true, other-sections false} (group-by (fn [[section-name]]
                                                                   (= section-name :settings))
                                                                 config-sections)]
    (concat settings-sections other-sections)))

(defn ^{:added "0.45.0"} initialize!
  "Initialize Metabase according to the directives in the config file, if it exists."
  []
  ;; TODO -- this should only do anything if we have an appropriate token (we should get a token for testing this before
  ;; enabling that check tho)
  (when-let [m (config)]
    (doseq [[section-name section-config] (sort-by-initialization-order (:config m))]
      ;; you can only use the config-from-file stuff with an EE/Pro token with the `:config-text-file` feature. Since you
      ;; might have to use the `:settings` section to set the token, skip the check for Settings. But check it for the
      ;; other sections.
      (when-not (= section-name :settings)
        (when-not (premium-features/enable-config-text-file?)
          (throw (ex-info (tru "Metabase config files require a Premium token with the :config-text-file feature.")
                          {}))))
      (log/info (u/format-color :magenta "Initializing %s from config file..." section-name) (u/emoji "🗄️"))
      (advanced-config.file.i/initialize-section! section-name section-config))
    (log/info (u/colorize :magenta "Done initializing from file.") (u/emoji "🗄️")))
  :ok)
