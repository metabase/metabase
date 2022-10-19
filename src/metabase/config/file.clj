(ns ^{:added "0.45.0"}
 metabase.config.file
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
   [camel-snake-kebab.core :as csk]
   [clojure.edn :as edn]
   [clojure.spec.alpha :as s]
   [clojure.string :as str]
   [clojure.tools.logging :as log]
   [clojure.walk :as walk]
   [environ.core :as env]
   [metabase.driver.common.parameters]
   [metabase.driver.common.parameters.parse :as params.parse]
   [metabase.util :as u]
   [metabase.util.files :as u.files]
   [metabase.util.i18n :refer [trs]]
   [yaml.core :as yaml]))

(comment metabase.driver.common.parameters/keep-me)

(set! *warn-on-reflection* true)

(defmulti section-spec
  "Spec that should be used to validate the config section with `section-name`, e.g. `:users`. Default spec
  is [[any?]].

  Sections are validated BEFORE template expansion, so as to avoid leaking any sensitive values in spec errors. Write
  your specs accordingly!

  Implementations of this method live in other namespaces. For example, the section spec for the `:users` section
  lives in [[metabase.models.user]]."
  {:arglists '([section-name])}
  keyword)

(defmethod section-spec :default
  [_section-name]
  any?)

(s/def :metabase.config.file.config/config
  (s/and
   map?
   (fn validate-section-configs [m]
     (doseq [[section-name section-config] m
             :let [spec (section-spec section-name)]]
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

  Yes, [[metabase.test/with-temp-env-var-value]] exists, but it is not allowed inside parallel tests. This is an
  experiment that I may adapt into a new pattern in the future to allow further test parallelization."
  env/env)

(defn- path
  "Path for the YAML config file Metabase should use for initialization and Settings values."
  ^java.nio.file.Path []
  (let [path* (or (some-> (get *env* :mb-config-file-path) u.files/get-path)
                  (u.files/get-path (System/getProperty "user.dir") "config.yml"))]
    (if (u.files/exists? path*)
      (log/info (u/colorize :magenta
                            (trs "Found config file at path {0}; Metabase will be initialized with values from this file"
                                 (pr-str (str path*))))
                (u/emoji "🗄️"))
      (log/info (u/colorize :yellow (trs "No config file found at path {0}" (pr-str (str path*))))))
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
  (get *env* (csk/->kebab-case-keyword env-var-name)))

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
                   (yaml/from-file (str (path)) true))]
    (s/assert* ::config m)
    (expand-templates m)))

(defmulti initialize-section!
  "Execute initialization code for the section of the init config file with the key `section-name` and value
  `section-config`.

  Implementations of this method live in other namespaces, for example the method for the `:users` section (to
  initialize Users) lives in [[metabase.models.user]]."
  {:arglists '([section-name section-config])}
  (fn [section-name _section-config]
    (keyword section-name)))

;;; if we don't know how to initialize a particular section, just log a warning and proceed. This way we can be
;;; forward-compatible and handle sections that might be unknown in a particular version of Metabase.
(defmethod initialize-section! :default
  [section-name _section-config]
  (log/warn (u/colorize :yellow (trs "Ignoring unknown config section {0}." (pr-str section-name)))))

(defn ^{:added "0.45.0"} initialize!
  "Initialize Metabase according to the directives in the config file, if it exists."
  []
  (when-let [m (config)]
    (doseq [[section-name section-config] (:config m)]
      (log/info (u/colorize :magenta (trs "Initializing {0} from config file..." section-name)) (u/emoji "🗄️"))
      (initialize-section! section-name section-config))
    (log/info (u/colorize :magenta (trs "Done initializing from file.")) (u/emoji "🗄️")))
  :ok)
