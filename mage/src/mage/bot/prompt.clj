(ns mage.bot.prompt
  "Fill template placeholders and write agent prompts.
   Supports {{KEY}} for value replacement and {{FILE:path}} for file inclusion."
  (:require
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn- parse-set-args
  "Parse --set KEY=VALUE arguments into a map of {\"KEY\" \"VALUE\"}."
  [set-args]
  (into {}
        (map (fn [s]
               (let [idx (str/index-of s "=")]
                 (when (and idx (pos? idx))
                   [(subs s 0 idx) (subs s (inc idx))])))
             set-args)))

(defn- resolve-file-includes
  "Replace all {{FILE:path}} placeholders with the contents of the referenced files.
   Paths are relative to the project root."
  [content]
  (str/replace content
               #"\{\{FILE:([^}]+)\}\}"
               (fn [[_ path]]
                 (let [full-path (str u/project-root-directory "/" (str/trim path))]
                   (if (.exists (java.io.File. ^String full-path))
                     (slurp full-path)
                     (do
                       (println (c/yellow "Warning: include file not found: " full-path))
                       (str "<!-- FILE NOT FOUND: " path " -->")))))))

(defn generate-prompt!
  "Fill a template with placeholders and write to output.
   Expects --template, --output, and one or more --set KEY=VALUE options.
   Also resolves {{FILE:path}} includes."
  [{:keys [options]}]
  (let [template-path (:template options)
        output-path   (:output options)
        set-args      (:set options)]
    (when (str/blank? template-path)
      (println (c/red "--template is required"))
      (u/exit 1))
    (when (str/blank? output-path)
      (println (c/red "--output is required"))
      (u/exit 1))
    (when-not (.exists (java.io.File. ^String template-path))
      (println (c/red "Template not found: " template-path))
      (u/exit 1))
    (let [replacements (parse-set-args (or set-args []))
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
