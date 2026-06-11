(ns mage.bot.prompt
  "Fill template placeholders and write agent prompts.
   Supports {{KEY}} for value replacement and {{FILE:path}} for file inclusion."
  (:require
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn- parse-set-args
  "Parse --set KEY=VALUE arguments into a map of {\"KEY\" \"VALUE\"}.
   Warns on entries without a `=` so typos surface."
  [set-args]
  (into {}
        (keep (fn [s]
                (let [idx (str/index-of s "=")]
                  (if (and idx (pos? idx))
                    [(subs s 0 idx) (subs s (inc idx))]
                    (do (println (c/yellow "Warning: --set value missing '=' (ignored): " s))
                        nil)))))
        set-args))

(defn- parse-set-from-file-args
  "Parse --set-from-file KEY=path arguments by reading the referenced file
   and producing a map of {\"KEY\" \"<file contents>\"}. Missing files become
   empty strings with a warning."
  [args]
  (into {}
        (keep (fn [s]
                (when-let [idx (str/index-of s "=")]
                  (when (pos? idx)
                    (let [k    (subs s 0 idx)
                          path (subs s (inc idx))
                          f    (java.io.File. ^String path)]
                      (if (.exists f)
                        [k (slurp f)]
                        (do
                          (println (c/yellow "Warning: --set-from-file path does not exist: " path))
                          [k ""])))))))
        args))

(defn- resolve-file-includes
  "Replace all {{FILE:path}} placeholders with the contents of the referenced files.
   Paths are relative to the project root. One pass only — included content is
   not re-scanned for further {{FILE:...}} markers."
  [content]
  (str/replace content
               #"\{\{FILE:([^}]+)\}\}"
               (fn [[_ path]]
                 (let [full-path (str u/project-root-directory "/" (str/trim path))]
                   (if (.exists (java.io.File. ^String full-path))
                     (slurp full-path)
                     (do
                       (println (c/yellow "Warning: {{FILE:" path "}} not found at " full-path))
                       (str "<!-- FILE NOT FOUND: " path " -->")))))))

(defn generate-prompt!
  "Fill a template with placeholders and write to output.
   Expects --template, --output, and one or more --set KEY=VALUE options.
   Also supports --set-from-file KEY=path to read a value from a file
   (useful for multi-line values you'd otherwise have to shell-escape).
   Also resolves {{FILE:path}} includes."
  [{:keys [options]}]
  (let [template-path  (:template options)
        output-path    (:output options)
        set-args       (:set options)
        set-file-args  (:set-from-file options)]
    (when (str/blank? template-path)
      (println (c/red "--template is required"))
      (u/exit 1))
    (when (str/blank? output-path)
      (println (c/red "--output is required"))
      (u/exit 1))
    (when-not (.exists (java.io.File. ^String template-path))
      (println (c/red "Template not found: " template-path))
      (u/exit 1))
    (let [replacements (merge (parse-set-from-file-args (or set-file-args []))
                              (parse-set-args (or set-args [])))
          template     (slurp template-path)
          ;; First resolve {{FILE:...}} includes
          with-files   (resolve-file-includes template)
          ;; Then replace {{KEY}} placeholders
          content      (reduce-kv (fn [s k v]
                                    (str/replace s (str "{{" k "}}") v))
                                  with-files
                                  replacements)]
      (.mkdirs (.getParentFile (java.io.File. ^String output-path)))
      (spit output-path content)
      (println (c/green "Wrote prompt: ") output-path)
      output-path)))
