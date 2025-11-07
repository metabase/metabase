(ns metabase.cmd.command-dox
  "Generate CLI command documentation by running

    clojure -M:run command-documentation

  or

    java --add-opens java.base/java.nio=ALL-UNNAMED -jar metabase.jar command-documentation"
  (:require
   [clojure.string :as str]
   [metabase.cmd.common :as cmd.common]))

(set! *warn-on-reflection* true)

(defn- command-vars
  "Returns a sorted sequence of [symbol var] pairs for all commands in metabase.cmd.core"
  []
  (require 'metabase.cmd.core)
  (sort-by first
           (filter (fn [[_symb varr]]
                     (:command (meta varr)))
                   (ns-interns 'metabase.cmd.core))))

(defn- format-arglist
  "Format an arglist for display in markdown"
  [command-name arglist]
  (let [args (remove #{'&} arglist)]
    (if (seq args)
      (str command-name " " (str/join " " args))
      command-name)))

(defn- format-arglists
  "Format all arglists for a command, joined with ' | '"
  [command-name arglists]
  (str/join " | " (map #(format-arglist command-name %) arglists)))

(defn- format-option
  "Format a single option spec as a markdown list item"
  [[short-opt long-opt desc & _]]
  (let [opts (remove str/blank? [short-opt long-opt])
        opt-str (str/join ", " opts)]
    (str "- `" opt-str "` - " desc)))

(defn- format-options
  "Format the options section for a command"
  [arg-spec]
  (when (seq arg-spec)
    (str "\n\nOptions:\n\n"
         (str/join "\n" (map format-option arg-spec)))))

(defn- normalize-whitespace
  "Normalize whitespace in a string by replacing multiple spaces and newlines with single spaces"
  [s]
  (-> s
      str/trim
      (str/replace #"\s+" " ")))

(defn- format-command
  "Generate markdown documentation for a single command"
  [[symb varr]]
  (let [{:keys [doc arg-spec arglists]} (meta varr)
        command-name (name symb)
        heading (str "## `" (format-arglists command-name arglists) "`")
        description (when doc
                      (str "\n\n" (normalize-whitespace doc)))
        options (format-options arg-spec)]
    (str heading description options)))

(defn- generate-commands-section
  "Generate the commands section of the documentation"
  []
  (str/join "\n\n" (map format-command (command-vars))))

(defn- header-section
  "Generate the header section of the documentation"
  []
  (cmd.common/load-resource! "commands/header.md"))

(defn- footer-section
  "Generate the footer section with additional useful commands"
  []
  (cmd.common/load-resource! "commands/footer.md"))

(defn- generate-documentation
  "Generate the complete commands documentation"
  []
  (str (header-section)
       "\n\n"
       (generate-commands-section)
       "\n\n"
       (footer-section)
       "\n"))

(defn generate-dox!
  "Generates CLI command documentation and writes it to docs/installation-and-operation/commands.md"
  ([]
   (generate-dox! "docs/installation-and-operation/commands.md"))
  ([^String output-file]
   (printf "Generating CLI command documentation in %s\n" output-file)
   (let [content (generate-documentation)]
     (cmd.common/write-doc-file! output-file content)
     (printf "Wrote commands documentation to %s\n" output-file))
   (println "Done.")))
