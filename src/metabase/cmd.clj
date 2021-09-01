(ns metabase.cmd
  "Functions for commands that can be ran from the command-line with `lein` or the Metabase JAR. These are ran as
  follows:

    <metabase> <command> <options>

  for example, running the `migrate` command and passing it `force` can be done using one of the following ways:

    lein run migrate force
    java -jar metabase.jar migrate force


  Logic below translates resolves the command itself to a function marked with `^:command` metadata and calls the
  function with arguments as appropriate.

  You can see what commands are available by running the command `help`. This command uses the docstrings and arglists
  associated with each command's entrypoint function to generate descriptions for each command."
  (:refer-clojure :exclude [load])
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.config :as config]
            [metabase.mbql.util :as mbql.u]
            [metabase.plugins.classloader :as classloader]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]))

(defn- system-exit!
  "Proxy function to System/exit to enable the use of `with-redefs`."
  [return-code]
  (System/exit return-code))

(defn ^:command migrate
  "Run database migrations. Valid options for `direction` are `up`, `force`, `down-one`, `print`, or `release-locks`."
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
  "Transfer data from existing database to newly created H2 DB with specified filename.

  Target H2 file is deleted before dump, unless the --keep-existing flag is given."
  [h2-filename & opts]
  (classloader/require 'metabase.cmd.dump-to-h2)
  (try
    (let [options        {:keep-existing? (boolean (some #{"--keep-existing"} opts))
                          :dump-plaintext? (boolean (some #{"--dump-plaintext"} opts)) }]
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
  (classloader/require 'environ.core 'metabase.core)
  (alter-var-root #'environ.core/env assoc :mb-jetty-join "false")
  (u/profile "start-normally" ((resolve 'metabase.core/start-normally))))

(defn ^:command reset-password
  "Reset the password for a user with `email-address`."
  [email-address]
  (classloader/require 'metabase.cmd.reset-password)
  ((resolve 'metabase.cmd.reset-password/reset-password!) email-address))

(defn ^:command refresh-integration-test-db-metadata
  "Re-sync the frontend integration test DB's metadata for the Sample Dataset."
  []
  (classloader/require 'metabase.cmd.refresh-integration-test-db-metadata)
  ((resolve 'metabase.cmd.refresh-integration-test-db-metadata/refresh-integration-test-db-metadata)))

(defn ^:command help
  "Show this help message listing valid Metabase commands."
  []
  (println "Valid commands are:")
  (doseq [[symb varr] (sort (ns-interns 'metabase.cmd))
          :when       (:command (meta varr))]
    (println symb (str/join " " (:arglists (meta varr))))
    (println "\t" (when-let [dox (:doc (meta varr))]
                    (str/replace dox #"\s+" " ")))) ; replace newlines or multiple spaces with single spaces
  (println "\nSome other commands you might find useful:\n")
  (println "java -cp metabase.jar org.h2.tools.Shell -url jdbc:h2:/path/to/metabase.db")
  (println "\tOpen an SQL shell for the Metabase H2 DB"))

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

(defn ^:command driver-methods
  "Print a list of all multimethods a available for a driver to implement. A useful reference when implementing a new
  driver."
  []
  (classloader/require 'metabase.cmd.driver-methods)
  ((resolve 'metabase.cmd.driver-methods/print-available-multimethods)))

(defn- cmd-args->map
  [args]
  (into {}
        (for [[k v] (partition 2 args)]
          [(mbql.u/normalize-token (subs k 2)) v])))

(defn- resolve-enterprise-command [symb]
  (try
    (classloader/require (symbol (namespace symb)))
    (resolve symb)
    (catch Throwable e
      (throw (ex-info (trs "The ''{0}'' command is only available in Metabase Enterprise Edition." (name symb))
                      {:command symb}
                      e)))))

(defn ^:command load
  "Load serialized metabase instance as created by `dump` command from directory `path`.

   `mode` can be one of `:update` or `:skip` (default)."
  ([path] (load path {"--mode" :skip
                      "--on-error" :continue}))

  ([path & args]
   (let [cmd (resolve-enterprise-command 'metabase-enterprise.serialization.cmd/load)]
     (cmd path (->> args
                    cmd-args->map
                    (m/map-vals mbql.u/normalize-token))))))

(defn ^:command dump
  "Serialized metabase instance into directory `path`. `args` options may contain --state option with one of
  `active` (default), `all`. With `active` option, do not dump archived entities."
  ([path] (dump path {"--state" :active}))
  ([path & args]
   (let [cmd (resolve-enterprise-command 'metabase-enterprise.serialization.cmd/dump)
         {:keys [user]} (cmd-args->map args)]
     (cmd path user))))

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
      (log/error "ERROR ROTATING KEY.")
      (system-exit! 1))))

;;; ------------------------------------------------ Running Commands ------------------------------------------------

(defn- cmd->fn [command-name]
  (or (when (seq command-name)
        (when-let [varr (ns-resolve 'metabase.cmd (symbol command-name))]
          (when (:command (meta varr))
            @varr)))
      (do (println (u/format-color 'red "Unrecognized command: %s" command-name))
          (help)
          (System/exit 1))))

(defn run-cmd
  "Run `cmd` with `args`. This is a function above. e.g. `lein run metabase migrate force` becomes
  `(migrate \"force\")`."
  [cmd args]
  (try (apply (cmd->fn cmd) args)
       (catch Throwable e
         (.printStackTrace e)
         (println (u/format-color 'red "Command failed with exception: %s" (.getMessage e)))
         (System/exit 1)))
  (System/exit 0))
