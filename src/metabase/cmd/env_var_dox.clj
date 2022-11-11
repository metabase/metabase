(ns metabase.cmd.env-var-dox
  (:require [clojure.java.classpath :as classpath]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.tools.namespace.find :as ns.find]
            [clojure.tools.reader.edn :as edn]
            [metabase.models.setting :as setting]
            [metabase.util :as u]))

(def env-vars-not-to-mess-with
  "Flamber advises that people avoid touching these environment variables."
  (set (edn/read-string (slurp (io/file "src/metabase/cmd/resources/env-vars-to-avoid.edn")))))

(defn- avoid?
  "Used to filter out environment variables with high foot-gun indices."
  [env-var]
  (contains? env-vars-not-to-mess-with (u/screaming-snake-case (name (:name env-var)))))

;;;; Environment variables docs intro

(defn- env-var-docs-intro
  "Exists just so we can write the intro in Markdown."
  []
  (str (slurp "src/metabase/cmd/resources/env-var-intro.md") "\n\n"))

(defn- get-settings
  "Loads all of the metabase namespaces, which loads all of the defsettings,
  which are registered in an atom in the settings namespace. Once settings are registered,
  This function derefs that atom and puts the settings into a sorted map for processing."
  []
  (for [ns-symb (ns.find/find-namespaces (classpath/system-classpath))
        :when (and
               (str/includes? (name ns-symb) "metabase")
               (not (str/includes? (name ns-symb) "test")))]
    (require ns-symb))
  (seq (into (sorted-map) @setting/registered-settings)))

(defn- setter?
  "Used to filter out environment variables that cannot be set."
  [env-var]
  (not= :none (:setter env-var)))

(defn- active?
  "Used to filter our deprecated enviroment variables."
  [env-var]
  (nil? (:deprecated env-var)))

(defn- prefix-mb
  "Takes a string and does something incomprehensible to it."
  [s]
  (str "MB_" s))

(defn- heading
  "Takes an integer and a string and creates a markdown heading of level n."
  [n s]
  (str (apply str (take n (repeat "#"))) " `" s "`"))

(defn- format-type
  "Helper function to specify the format of an environment variable's type for its documentation."
  [env-var]
  (str "Type: " (name (:type env-var))))

(defn- format-default
  "Helper function to specify how to format the default value of an enviromnent variable.
  for use in the environment variable docs."
  [env-var]
  (let [d (:default env-var)]
    (str "Default: "
         (if (false? d) "`false`"
             (if (:default env-var)
               (str "`" (:default env-var) "`")
               "`null`")))))

(defn- format-description
  "Helper function to specify description format for enviromnent variable docs."
  [env-var]
  (->> (:description env-var)
       u/add-period
       ;; Drop brackets used to create source code links
       (#(str/replace % #"\[\[|\]\]" ""))))

(defn env-var-entry
  "Preps a doc entry for an environment variable as a Markdown section."
  [env-var]
  (str/join "\n\n" [(heading 3 (prefix-mb (u/screaming-snake-case (name (:name env-var)))))
                    (format-type env-var)
                    (format-default env-var)
                    (format-description env-var)]))

(defn format-env-var-docs
  "Preps environment variable docs as a Markdown string."
  []
  (->> (get-settings)
       (map (fn [[_ v]] v))
       (filter setter?)
       (filter active?)
       (remove avoid?)
       (map env-var-entry)))

(defn generate-dox!
  "Prints the generated environment variable docs to a file."
  []
  (println "Generating docs for environment variables...")
  (spit (io/file "docs/configuring-metabase/environment-variables.md") (apply str (env-var-docs-intro)
                                                                                  (str/join "\n\n" (format-env-var-docs))))
  (println "Done."))
