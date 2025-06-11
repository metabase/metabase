(ns mage.alias
  (:require
   [babashka.fs :as fs]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u]))

(def ^:private mage-alias-comment "## MAGE (Metabase Automation Genius Engine) alias. [auto-installed]")

(defn y-n-prompt
  "Prompt the user with a yes/no question.
   Returns true for 'yes' and false for 'no'."
  [prompt]
  (let [answer (do (println "\n" prompt) (print "[y/n]: ") (flush) (read-line))]
    (cond
      (#{"y" "Y"} answer) true
      (#{"n" "N" "no"} answer) false
      :else (do
              (println "Please answer 'y' or 'n'.")
              (recur prompt)))))

(defn install
  "Run a shell command with the given alias.
   If the alias is not found, it will print an error message and exit."
  [_args]
  (let [mb-dir (u/sh "pwd")
        shell (u/env "SHELL")
        shell-type (cond (str/ends-with? shell "zsh") "zsh"
                         (str/ends-with? shell "bash") "bash"
                         (str/ends-with? shell "fish") "fish"
                         :else nil)
        _ (when (nil? shell-type)
            (c/red "Shell " (c/white shell) " not supported. Please install the alias manually,\nhave mage do 'cd path/to/metabase && ./bin/mage @1'"))
        rc-file (case shell-type
                  "zsh" (str (fs/expand-home "~/.zshrc"))
                  "bash" (str (fs/expand-home "~/.bashrc"))
                  "fish" (str (fs/expand-home "~/.config/fish/config.fish")))
        the-mage-alias (case shell-type
                         "zsh"
                         ["" mage-alias-comment "mage() {" (str "  cd " mb-dir " && ./bin/mage \"$@\"") "}"]

                         "bash"
                         ["" mage-alias-comment "mage() {" (str "    cd " mb-dir " && exec ./bin/mage \"$@\"") "}"]

                         "fish"
                         ["" mage-alias-comment "function mage" (str "    cd " mb-dir " && exec ./bin/mage $argv") "end"])
        _ (when (contains? (set (str/split-lines (slurp rc-file))) mage-alias-comment)
            (throw (ex-info (c/yellow "Alias already exists in " (c/green rc-file) ". No need to reinstall it!") {:babashka/exit 1})))
        _ (println (c/green "Installing the 'mage' alias, which cds to the Metabase directory and runs the './bin/mage' command for you."))
        _ (println (c/green "Config:") (pr-str {:mb-dir mb-dir :shell-type shell-type}))
        install-it? (y-n-prompt
                     (str "Do you want to install the following 'mage' alias"
                          " for " (c/green shell-type)
                          " in " (c/green rc-file) "?\n"
                          "\n--- The Mage Alias ---\n"
                          (c/magenta (str/join \newline the-mage-alias)) "\n"))]
    (if install-it?
      (do
        (println "Installing alias for shell:" (c/green shell-type))
        (println "Alias will be installed in:" (c/green mb-dir))
        ;; Create the alias in the appropriate shell config file
        (spit (str (fs/expand-home "~/.zshrc")) (str/join \newline the-mage-alias) :append true)
        (println (c/green "Alias installed successfully!"))
        (println "To apply the changes, please restart your terminal or run:")
        (println (c/cyan (str "source " rc-file))))
      (do
        (println (c/red "Alias installation aborted."))
        (println "You can install the alias manually by copying the mage alias from the output above.")))))
