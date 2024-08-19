(ns metabase.cmd
  "Functions for commands that can be ran from the command-line with the Clojure CLI or the Metabase JAR. These are ran
  as follows:

    <metabase> <command> <options>

  for example, running the `migrate` command and passing it `force` can be done using one of the following ways:

    clojure -M:run migrate force
    java -jar metabase.jar migrate force

  Logic below translates resolves the command itself to a function marked with `^:command` metadata and calls the
  function with arguments as appropriate.

  You can see what commands are available by running the command `help`. This command uses the docstrings and arglists
  associated with each command's entrypoint function to generate descriptions for each command."
  (:refer-clojure :exclude [load import])
  (:require
   [clojure.string :as str]
   [clojure.tools.cli :as cli]
   [environ.core :as env]
   [metabase.config :as config]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;; Command processing and option parsing utilities, etc.

(defn- system-exit!
  "Proxy function to System/exit to enable the use of `with-redefs`."
  [return-code]
  (System/exit return-code))

(defn- cmd->var
  "Looks up a command var by name"
  [command-name]
  (ns-resolve 'metabase.cmd (symbol command-name)))

(defn- call-enterprise
  "Resolves enterprise command by symbol and calls with args, or else throws error if not EE"
  [symb & args]
  (let [f (try
            (classloader/require (symbol (namespace symb)))
            (or (resolve symb)
                (throw (ex-info (trs "{0} does not exist" symb) {})))
            (catch Throwable e
              (throw (ex-info (trs "The ''{0}'' command is only available in Metabase Enterprise Edition." (name symb))
                              {:command symb}
                              e))))]
    (apply f args)))

(defn- get-parsed-options
  [iref options]
  (:options (cli/parse-opts options (:arg-spec (meta iref)))))

;; Command implementations

(defn ^:command migrate
  "Run database migrations. Valid options for `direction` are `up`, `force`, `down`, `print`, or `release-locks`."
  [direction]
  (classloader/require 'metabase.cmd.migrate)
  ((resolve 'metabase.cmd.migrate/migrate!) direction))

(defn ^:command load-from-h2
  "Transfer data from existing H2 database to the newly created MySQL or Postgres DB specified by env vars."
  ([]
   (load-from-h2 nil))
  ([h2-connection-string]
   (classloader/require 'metabase.cmd.load-from-h2)
   ((resolve 'metabase.cmd.load-from-h2/load-from-h2!) h2-connection-string)))

(defn ^:command dump-to-h2
  {:doc "Transfer data from existing database to newly created H2 DB with specified filename.

         Target H2 file is deleted before dump, unless the --keep-existing flag is given."
   :arg-spec [["-k" "--keep-existing" "Do not delete target H2 file if it exists."
               :id :keep-existing?]
              ["-p" "--dump-plaintext" "Do not encrypt dumped contents."
               :id :dump-plaintext?]]}
  [h2-filename & opts]
  (classloader/require 'metabase.cmd.dump-to-h2)
  (try
    (let [options (get-parsed-options #'dump-to-h2 opts)]
      ((resolve 'metabase.cmd.dump-to-h2/dump-to-h2!) h2-filename options)
      (println "Dump complete")
      (system-exit! 0))
    (catch Throwable e
      (log/error e "Failed to dump application database to H2 file")
      (system-exit! 1))))

(defn ^:command profile
  "Start Metabase the usual way and exit. Useful for profiling Metabase launch time."
  []
  ;; override env var that would normally make Jetty block forever
  (alter-var-root #'env/env assoc :mb-jetty-join "false")
  (u/profile "start-normally" ((resolve 'metabase.core/start-normally))))

(defn ^:command reset-password
  "Reset the password for a user with `email-address`."
  [email-address]
  (classloader/require 'metabase.cmd.reset-password)
  ((resolve 'metabase.cmd.reset-password/reset-password!) email-address))

(defn ^:command help
  "Show this help message listing valid Metabase commands."
  ([command-name]
   (let [{:keys [doc arg-spec arglists]} (meta (cmd->var command-name))]
     (doseq [arglist arglists]
       (apply println command-name arglist))
     (when doc
       (doseq [doc-line (str/split doc #"\n\s+")]
         (println "\t" doc-line)))
     (when (seq arg-spec)
       (println "\t" "Options:")
       (doseq [opt-line (str/split (:summary (cli/parse-opts [] arg-spec)) #"\n")]
         (println "\t" opt-line)))))
  ([]
   (println "Valid commands are:")
   (doseq [[symb varr] (sort (ns-interns 'metabase.cmd))
           :when       (:command (meta varr))]
     (help symb)
     (println))
   (println "\nSome other commands you might find useful:\n")
   (println "java -cp metabase.jar org.h2.tools.Shell -url jdbc:h2:/path/to/metabase.db")
   (println "\tOpen an SQL shell for the Metabase H2 DB")))

(defn ^:command version
  "Print version information about Metabase and the current system."
  []
  (println "Metabase version:" config/mb-version-info)
  (println "\nOS:"
           (System/getProperty "os.name")
           (System/getProperty "os.version")
           (System/getProperty "os.arch"))
  (println "\nJava version:"
           (System/getProperty "java.vm.name")
           (System/getProperty "java.version"))
  (println "\nCountry:"       (System/getProperty "user.country"))
  (println "System timezone:" (System/getProperty "user.timezone"))
  (println "Language:"        (System/getProperty "user.language"))
  (println "File encoding:"   (System/getProperty "file.encoding")))

(defn ^:command api-documentation
  "Generate a markdown file containing documentation for all API endpoints. This is written to a file called
  `docs/api-documentation.md`."
  []
  (classloader/require 'metabase.cmd.endpoint-dox)
  ((resolve 'metabase.cmd.endpoint-dox/generate-dox!)))

(defn ^:command environment-variables-documentation
  "Generates a markdown file containing documentation for environment variables relevant to configuring Metabase.
  The command only includes environment variables registered as defsettings.
  For a full list of environment variables, see https://www.metabase.com/docs/latest/configuring-metabase/environment-variables."
  []
  (classloader/require 'metabase.cmd.env-var-dox)
  ((resolve 'metabase.cmd.env-var-dox/generate-dox!)))

(defn ^:command driver-methods
  "Print a list of all multimethods available for a driver to implement, optionally with their docstrings."
  ([]
   (classloader/require 'metabase.cmd.driver-methods)
   ((resolve 'metabase.cmd.driver-methods/print-available-multimethods) false))
  ([_docs]
   (classloader/require 'metabase.cmd.driver-methods)
   ((resolve 'metabase.cmd.driver-methods/print-available-multimethods) true)))

(defn ^:command load
  {:doc "Note: this command is deprecated. Use `import` instead.
         Load serialized Metabase instance as created by [[dump]] command from directory `path`."
   :arg-spec [["-m" "--mode (skip|update)" "Update or skip on conflicts."
               :default      :skip
               :default-desc "skip"
               :parse-fn     mbql.u/normalize-token
               :validate     [#{:skip :update} "Must be 'skip' or 'update'"]]
              ["-e" "--on-error (continue|abort)"  "Abort or continue on error."
               :default      :continue
               :default-desc "continue"
               :parse-fn     mbql.u/normalize-token
               :validate     [#{:continue :abort} "Must be 'continue' or 'abort'"]]]}
  [path & options]
  (log/warn (u/colorize :red "'load' is deprecated and will be removed in a future release. Please migrate to 'import'."))
  (call-enterprise 'metabase-enterprise.serialization.cmd/v1-load! path (get-parsed-options #'load options)))

(defn ^:command ^:requires-init import
  {:doc "Load serialized Metabase instance as created by the [[export]] command from directory `path`."
   :arg-spec [["-e" "--continue-on-error" "Do not break execution on errors."]]}
  [path & options]
  (call-enterprise 'metabase-enterprise.serialization.cmd/v2-load! path (get-parsed-options #'import options)))

(defn ^:command dump
  {:doc "Note: this command is deprecated. Use `export` instead.
         Serializes Metabase instance into directory `path`."
   :arg-spec [["-u" "--user EMAIL"         "Export collections owned by the specified user"]
              ["-s" "--state (active|all)" "When set to `active`, do not dump archived entities. Default behavior is `all`."
               :default      :all
               :default-desc "all"
               :parse-fn     mbql.u/normalize-token
               :validate     [#{:active :all} "Must be 'active' or 'all'"]]
              [nil "--include-entity-id"   "Include entity_id property in all dumped entities. Default: false."]]}
  [path & options]
  (log/warn (u/colorize :red "'dump' is deprecated and will be removed in a future release. Please migrate to 'export'."))
  (call-enterprise 'metabase-enterprise.serialization.cmd/v1-dump! path (get-parsed-options #'dump options)))

(defn ^:command export
  {:doc "Serialize Metabase instance into directory at `path`."
   :arg-spec [["-c" "--collection ID"            "Export only specified ID(s). Use commas to separate multiple IDs. You can pass entity ids with `eid:<...>` as a prefix."
               :id        :collection-ids
               :parse-fn  (fn [raw-string] (->> (str/split raw-string #"\s*,\s*")
                                                (map (fn [v]
                                                       (if (str/starts-with? v "eid:")
                                                         v
                                                         (parse-long v))))))]
              ["-C" "--no-collections"           "Do not export any content in collections."]
              ["-S" "--no-settings"              "Do not export settings.yaml"]
              ["-D" "--no-data-model"            "Do not export any data model entities; useful for subsequent exports."]
              ["-f" "--include-field-values"     "Include field values along with field metadata."]
              ["-s" "--include-database-secrets" "Include database connection details (in plain text; use caution)."]
              ["-e" "--continue-on-error"        "Do not break execution on errors."]]}
  [path & options]
  (call-enterprise 'metabase-enterprise.serialization.cmd/v2-dump! path (get-parsed-options #'export options)))

(defn ^:command seed-entity-ids
  "Add entity IDs for instances of serializable models that don't already have them."
  []
  (when-not (call-enterprise 'metabase-enterprise.serialization.cmd/seed-entity-ids!)
    (throw (Exception. "Error encountered while seeding entity IDs"))))

(defn ^:command drop-entity-ids
  "Drop entity IDs for instances of serializable models. Useful for migrating from v1 serialization (x.46 and earlier)
  to v2 (x.47+)."
  []
  (when-not (call-enterprise 'metabase-enterprise.serialization.cmd/drop-entity-ids!)
    (throw (Exception. "Error encountered while dropping entity IDs"))))

(defn ^:command rotate-encryption-key
  "Rotate the encryption key of a metabase database. The MB_ENCRYPTION_SECRET_KEY environment variable has to be set to
  the current key, and the parameter `new-key` has to be the new key. `new-key` has to be at least 16 chars."
  [new-key]
  (classloader/require 'metabase.cmd.rotate-encryption-key)
  (try
    ((resolve 'metabase.cmd.rotate-encryption-key/rotate-encryption-key!) new-key)
    (log/info "Encryption key rotation OK.")
    (system-exit! 0)
    (catch Throwable e
      (log/error e "ERROR ROTATING KEY.")
      (system-exit! 1))))

;;; ------------------------------------------------ Validate Commands ----------------------------------------------

(defn- arg-list-count-ok? [arg-list arg-count]
  (if (some #{'&} arg-list)
    ;; subtract 1 for the & and 1 for the symbol after &
    ;; e.g. [a b & c] => 2
    (>= arg-count (- (count arg-list) 2))
    (= arg-count (count arg-list))))

(defn- arg-count-errors
  [command-name args]
  (let [arg-lists (-> command-name cmd->var meta :arglists)]
    (when-not (some #(arg-list-count-ok? % (count args)) arg-lists)
      (str "The '" command-name "' command requires "
           (when (> 1 (count arg-lists)) "one of ")
           "the following arguments: "
           (str/join " | " (map pr-str arg-lists))
           ", but received: " (pr-str (vec args)) "."))))

;;; ------------------------------------------------ Running Commands ------------------------------------------------

(defn- validate
  "Returns [error-message] if there is an error, otherwise [nil command-fn]"
  [command-name args]
  (let [varr (cmd->var command-name)
        {:keys [command arg-spec]} (meta varr)
        err  (arg-count-errors command-name args)]
    (cond
      (not command)
      [(str "Unrecognized command: '" command-name "'")
       (str "Valid commands: " (str/join ", " (map key (filter (comp :command meta val) (ns-interns 'metabase.cmd)))))]

      err
      [err]

      arg-spec
      (:errors (cli/parse-opts args arg-spec)))))

(defn- requires-init?
  [command-name]
  (-> command-name cmd->var meta :requires-init))

(defn- fail!
  [& messages]
  (doseq [msg messages]
    (println (u/format-color 'red msg)))
  (System/exit 1))

(defn run-cmd
  "Run `cmd` with `args`. This is a function above. e.g. `clojure -M:run metabase migrate force` becomes
  `(migrate \"force\")`."
  [command-name init-fn args]
  (if-let [errors (validate command-name args)]
    (do
      (when (cmd->var command-name)
        (println "Usage:")
        (help command-name))
      (apply fail! errors))
    (try
      (when (requires-init? command-name)
        (init-fn))
      (apply @(cmd->var command-name) args)
      (catch Throwable e
        (.printStackTrace e)
        (fail! (str "Command failed with exception: " (.getMessage e))))))
  (System/exit 0))
