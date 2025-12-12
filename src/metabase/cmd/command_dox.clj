(ns metabase.cmd.command-dox
  "Generate CLI command documentation by running

    clojure -M:run command-documentation

  or

    java --add-opens java.base/java.nio=ALL-UNNAMED -jar metabase.jar command-documentation"
  (:require
   [clojure.string :as str]
   [metabase.cmd.common :as cmd.common]))

(set! *warn-on-reflection* true)

(def ^:private section-separator
  "Separator between major sections in generated documentation"
  "\n\n")

(def ^:private document-ending
  "Trailing newline at end of document"
  "\n")

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
  "Format a single option spec as a markdown list item"
  [[short-opt long-opt desc & _]]
  (let [opt-str (->> [short-opt long-opt]
                     (remove str/blank?)
                     (str/join ", "))]
    (format "- `%s` - %s" opt-str desc)))

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

(defn- format-description
  "Format a docstring as markdown description"
  [doc]
  (some-> doc
          normalize-whitespace
          (->> (str "\n\n"))))

(defn- format-command
  "Generate markdown documentation for a single command"
  [[symb varr]]
  (let [{:keys [doc arg-spec arglists]} (meta varr)
        command-name (name symb)
        heading (str "## `" (format-arglists command-name arglists) "`")]
    (str heading
         (format-description doc)
         (format-options arg-spec))))

(defn- generate-commands-section
  "Generate the commands section of the documentation"
  []
  (->> (command-vars)
       (map format-command)
       (str/join section-separator)))

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
  (str/join section-separator
            [(header-section)
             (generate-commands-section)
             (str (footer-section) document-ending)]))

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
