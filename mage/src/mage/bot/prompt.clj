(ns mage.bot.prompt
  "Fill template placeholders and write agent prompts.
   A single generic command — all intelligence (issue lookup, DB detection)
   lives in the calling Claude command, not here."
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

(defn generate-prompt!
  "Fill a template with placeholders and write to output.
   Expects --template, --output, and one or more --set KEY=VALUE options."
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
          content      (reduce-kv (fn [s k v]
                                    (str/replace s (str "{{" k "}}") v))
                                  template
                                  replacements)]
      (.mkdirs (.getParentFile (java.io.File. ^String output-path)))
      (spit output-path content)
      (println (c/green "Wrote prompt: ") output-path)
      output-path)))
