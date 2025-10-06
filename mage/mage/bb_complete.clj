(ns mage.bb-complete
  (:require
   [clojure.edn :as edn]
   [clojure.string :as str]))

(def SHELL "Current shell"
  #_:clj-kondo/ignore
  (or (some-> (System/getenv "SHELL")
              (str/split #"/")
              last)
      "zsh"))

(defn read-bb-edn
  "Read and parse bb.edn from current directory"
  []
  (try
    (-> "bb.edn" slurp edn/read-string)
    (catch Exception _e
      {:tasks {}})))

(defn get-tasks
  "Extract all tasks from bb.edn"
  [bb-config]
  (->> (:tasks bb-config)
       (remove (fn [[k _v]] (str/starts-with? (name k) "__")))
       (into {})))

(defn parse-task-options
  "Extract option flags from task :options definition"
  [task]
  (some->> (:options task)
           (mapcat (fn [[short long doc]]
                     [[short doc]
                      [(first (str/split long #" ")) doc]]))))

(defn complete-tasks
  "Complete task names matching prefix"
  [prefix tasks]
  (let [fltr (if (str/blank? prefix)
               (complement #(str/starts-with? % "-"))
               #(str/starts-with? % prefix))
        fmt (if (= SHELL "zsh")
              (fn [[k v]]
                (str (name k) ":" (:doc v)))
              (comp name key))]
    (->> tasks (map fmt) (filter fltr) sort)))

(defn complete-options
  "Complete options for a specific task"
  [{:keys [task-name current]} tasks]
  (when-let [task (get tasks (symbol task-name))]
    (let [fmt (if (= SHELL "zsh")
                (fn [[n doc]] (str n ":" doc))
                first)]
      (->> (parse-task-options task)
           (filter #(str/starts-with? (first %) current))
           (map fmt)))))

(defn parse-completion-context
  "Parse the current completion context from command line args"
  [args]
  (let [words        (vec args)
        current      (or (last words) "")
        prev         (when (> (count words) 1) (nth words (- (count words) 2)))
        task-idx     (first (keep-indexed
                             (fn [idx word]
                               (when-not (str/starts-with? word "-")
                                 idx))
                             (butlast words)))
        task-name    (when task-idx (nth words task-idx nil))
        after-task   (drop (inc (or task-idx -1)) (butlast words))
        options      (filter #(str/starts-with? % "-") after-task)
        arguments    (remove #(str/starts-with? % "-") after-task)]
    {:words              words
     :current            current
     :prev               prev
     :task-name          task-name
     :completing-option? (str/starts-with? current "-")
     :after-task?        (some? task-idx)
     :num-options        (count options)
     :num-arguments      (count arguments)}))

(defn generate-completions
  "Main completion logic - returns seq of completion strings"
  [args]
  (let [bb-config (read-bb-edn)
        tasks     (get-tasks bb-config)
        ctx       (parse-completion-context args)]
    (cond
      (not (:after-task? ctx))  (complete-tasks (:current ctx) tasks)
      (:completing-option? ctx) (complete-options ctx tasks))))

(defn strip-indent
  "Remove prefix indent from a string"
  [s]
  (let [lines      (str/split-lines s)
        non-empty  (->> (rest lines) (remove str/blank?))
        min-indent (if-not (seq non-empty)
                     0
                     (->> non-empty
                          (map #(count (re-find #"^\s*" %)))
                          (apply min)))
        strip-re   (re-pattern (str "^\\s{0," min-indent "}"))]
    (->> lines
         (map #(str/replace % strip-re ""))
         (str/join "\n"))))

(def zsh-completion-script
  "Shell script for zsh completion system"
  (strip-indent
   "#compdef _mage mage
    # Usage: put that into `~/.zsh.d/_mage`
    _mage() {
      local -a response
      response=(\"${(@f)$(bin/mage -complete \"${words[@]:1}\")}\")
      _describe 'mage' response
    }

    compdef _mage mage"))

(def bash-completion-script
  "Shell script for bash completion system"
  (strip-indent
   "_mage_completions() {
      local words=(\"${COMP_WORDS[@]:1}\")
      local IFS=$'\n'
      local completions=($(bin/mage -complete \"${words[@]}\"))
      COMPREPLY=($(compgen -W \"${completions[*]}\" -- \"${COMP_WORDS[COMP_CWORD]}\"))
    }
    complete -F _mage_completions mage"))

(defn complete
  "Complete bb.edn commands and options, to be called from shell

  Do smth like `bin/mage -complete -install > ~/.zsh.d/_mage` to install."
  [args]
  (case (first args)
    "-install"
    (let [shell      (or (second args) SHELL)
          shell-name (last (str/split shell #"/"))]
      (println
       (case shell-name
         "zsh"  zsh-completion-script
         "bash" bash-completion-script
         (str "Unsupported shell: " shell-name))))

    (println (str/join "\n" (generate-completions args)))))
