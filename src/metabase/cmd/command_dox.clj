(ns metabase.cmd.command-dox
  "Generate CLI command documentation by running

    clojure -M:run command-documentation

  or

    java --add-opens java.base/java.nio=ALL-UNNAMED -jar metabase.jar command-documentation"
  (:require
   [clojure.string :as str]
   [metabase.cmd.common :as cmd.common]
   [metabase.cmd.markdown :as md]))

(set! *warn-on-reflection* true)

(defn- command?
  "Returns true if the var has :command metadata"
  [[_symb varr]]
  (-> varr meta :command boolean))

(defn- command-vars
  "Returns a sorted sequence of [symbol var] pairs for all commands in metabase.cmd.core"
  []
  (require 'metabase.cmd.core)
  (->> (ns-interns 'metabase.cmd.core)
       (filter command?)
       (sort-by first)))

(defn- format-arglist
  "Format an arglist for display in markdown"
  [command-name arglist]
  (let [args (->> arglist
                  (remove #{'&})
                  (str/join " "))]
    (cond-> command-name
      (seq args) (str " " args))))

(defn- format-arglists
  "Format all arglists for a command, joined with ' | '"
  [command-name arglists]
  (->> arglists
       (map #(format-arglist command-name %))
       (str/join " | ")))

(defn- format-option
  "Format a single option spec as the contents of a Markdown bullet. The `- ` prefix is [[md/bullets]]' job."
  [[short-opt long-opt desc & _]]
  (let [opt-str (->> [short-opt long-opt]
                     (remove str/blank?)
                     (str/join ", "))]
    (str (md/code opt-str) " - " desc)))

(defn- format-options
  "Format the options section for a command. Nil when the command takes none, so it drops out of the section."
  [arg-spec]
  (when (seq arg-spec)
    (md/labeled-block "Options:" (md/bullets (map format-option arg-spec)))))

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
        command-name (name symb)]
    ;; a command with no docstring or no options contributes nothing, rather than a stray blank line
    (md/paragraphs [(md/heading 2 (md/code (format-arglists command-name arglists)))
                    (some-> doc normalize-whitespace)
                    (format-options arg-spec)])))

(defn- generate-commands-section
  "Generate the commands section of the documentation"
  []
  (md/paragraphs (map format-command (command-vars))))

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
  (md/document [(header-section)
                (generate-commands-section)
                (footer-section)]))

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
