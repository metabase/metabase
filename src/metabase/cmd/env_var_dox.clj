(ns metabase.cmd.env-var-dox
  "Code to generate docs for environment variables. You can generate
  docs by running: `clojure -M:ee:run environment-variables-documentation`"
  (:require
   [clojure.java.classpath :as classpath]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.tools.namespace.find :as ns.find]
   [clojure.tools.reader.edn :as edn]
   [metabase.models.setting :as setting]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.util :as u]))

(defn prep-settings
  "Used to return a map from the registered settings atom."
  [settings]
  (->> settings
       (into (sorted-map))
       seq
       (map (fn [[_ v]] v))))

(defn get-settings
  "Loads all (or a set of) of the Metabase namespaces, which loads all of the defsettings,
  which are registered in an atom in the settings namespace. Once settings are registered,
  this function derefs that atom and puts the settings into a sorted map for processing."
  ([]
   (doseq [ns-symb (ns.find/find-namespaces (classpath/system-classpath))
           :when (and
                  (str/includes? (name ns-symb) "metabase")
                  (not (str/includes? (name ns-symb) "test")))]
     (require ns-symb))
   (prep-settings @setting/registered-settings))
  ;; Or supply a set of namespaces to load
  ;; Primarily used for testing
  ([ns-set]
   (doseq [ns-symb (ns.find/find-namespaces (classpath/system-classpath))
           :when (ns-set (name ns-symb))]
     (require ns-symb))
   (prep-settings @setting/registered-settings)))

;;;; Formatting functions

(defn- format-type
  "Helper function to specify the format of an environment variable's type for its documentation."
  [env-var]
  (str "Type: " (name (:type env-var))))

(defn- handle-defaults-set-elsewhere
  "Handles defaults not set in the `defsetting.`"
  [env-var]
  (let [n (:name env-var)]
    (cond (= :aggregated-query-row-limit n) (assoc env-var :default (:max-results (qp.constraints/default-query-constraints)))
          (= :unaggregated-query-row-limit n) (assoc env-var :default (:max-results-bare-rows (qp.constraints/default-query-constraints)))
          :else env-var)))

(defn- format-default
  "Helper function to specify how to format the default value of an environment variable.
  for use in the environment variable docs."
  [env-var]
  (let [d (:default (handle-defaults-set-elsewhere env-var))]
    (str "Default: "
         (cond
           (false? d) "`false`"
           (nil? d) "`null`"
           :else (str "`" d "`")))))

(defn- format-prefix
  "Used to build an environment variable, like `MB_ENV_VAR_NAME`"
  [env-var]
  (str "MB_" (u/->SCREAMING_SNAKE_CASE_EN (:munged-name env-var))))

(defn- format-heading
  "Takes an integer and a string and creates a Markdown heading of level n."
  [n s]
  (str (apply str (take n (repeat "#"))) " `" s "`"))

(defn- format-description
  "Helper function to specify description format for enviromnent variable docs."
  [env-var]
  (->> ((:description env-var))
       u/add-period
       ;; Drop brackets used to create source code links
       (#(str/replace % #"\[\[|\]\]" ""))))

(def paid-message
  "Used to mark an env var that requires a paid plan."
  "> Only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.")

(defn- format-paid
  "Does the variable require a paid license?"
  [env-var]
  (if (nil? (:feature env-var))
    ""
    paid-message))

(defn- format-export
  "Whether the variable is exported in serialization settings."
  [env-var]
  (if (true? (:export? env-var))
    (str "[Exported as](../installation-and-operation/serialization.md): `" (:munged-name env-var) "`.")
    ""))

(defn- format-doc
  "Includes additional documentation for an environment variable, if it exists."
  [env-var]
  (when-let [d (:doc env-var)]
    d))

(defn- format-config-name
  "Formats the configuration file name for an environment variable."
  [env-var]
  (if (= (:visibility env-var) :internal)
    ""
    (str "[Configuration file name](./config-file.md): `" (:munged-name env-var) "`")))

(defn list-item
  "Create a list item for an entry, like `- Default: 100`."
  [entry]
  (if (or (str/blank? entry)
          (nil? entry))
    ""
    (str "- " entry)))

(defn format-list
  "Used to format metadata as a list."
  [entries]
  (str/join "\n" (remove str/blank? (map list-item entries))))

(defn- format-env-var-entry
  "Preps a doc entry for an environment variable as a Markdown section."
  [env-var]
  (str/join "\n\n" (remove str/blank?
                           [(format-heading 3 (format-prefix env-var))
                            (format-paid env-var)
                            ;; metadata we should format as a list
                            ;; Like `- Default: 100`
                            (format-list [(format-type env-var)
                                          (format-default env-var)
                                          (format-export env-var)
                                          (format-config-name env-var)])
                            (format-description env-var)
                            (format-doc env-var)])))

;;;; Filter functions

(def env-vars-not-to-mess-with
  "Flamber advises that people avoid touching these environment variables."
  (set (edn/read-string (slurp (io/resource "metabase/cmd/resources/env-vars-to-avoid.edn")))))

(defn- avoid?
  "Used to filter out environment variables with high foot-gun indices."
  [env-var]
  (or (false? (:doc env-var))
              ;; Ideally, we'd move off of this list completely, but not all environment variables
              ;; are defsettings.
      (contains? env-vars-not-to-mess-with (format-prefix env-var))))

(defn- setter?
  "Used to filter out environment variables that cannot be set."
  [env-var]
  (not= :none (:setter env-var)))

(defn- active?
  "Used to filter our deprecated enviroment variables."
  [env-var]
  (nil? (:deprecated env-var)))

(defn- only-local?
  "Used to filter out environment variables that are only local."
  [env-var]
  (or (= (:user-local env-var) :only)
      (= (:database-local env-var) :only)))

(defn format-env-var-docs
  "Preps relevant environment variable docs as a Markdown string."
  [settings]
  (->> settings
       (filter setter?)
       (filter active?)
       (remove avoid?)
       (remove only-local?)
       (map format-env-var-entry)))

(defn- format-intro
  "Exists just so we can write the intro in Markdown."
  []
  (str (slurp "src/metabase/cmd/resources/env-var-intro.md") "\n\n"))

(defn- non-defsetting-env-vars
  "Retrieves environment variables not specified via `defsetting`."
  []
  (str "\n\n" (slurp "src/metabase/cmd/resources/other-env-vars.md") "\n"))

(defn prep-dox
  "Preps the environment variable docs for printing."
  []
  (apply str (format-intro)
         (str/join "\n\n" (format-env-var-docs (get-settings)))
         (non-defsetting-env-vars)))

(defn generate-dox!
  "Prints the generated environment variable docs to a file."
  []
  (println "Generating docs for environment variables...")
  (spit (io/file "docs/configuring-metabase/environment-variables.md") (prep-dox))
  (println "Done."))
