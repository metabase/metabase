(ns mage.alias
  (:require
   [babashka.fs :as fs]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u]
   [selmer.parser :as selmer]))

;; DO NOT change these, it will break idempotent alias installation
(def ^:private marker-start "## MAGE (Metabase Automation Genius Engine)")
(def ^:private marker-end "## END MAGE [auto-installed]")

(defn- render-template [template-file]
  (selmer/render (slurp template-file) {:mb-dir u/project-root-directory}))

(defn- read-file-safe [path] (when (fs/exists? path) (slurp path)))

(defn- find-marker-positions [content]
  (let [lines (str/split-lines content)
        start-idx (first (keep-indexed #(when (str/includes? %2 marker-start) %1) lines))
        end-idx (when start-idx
                  (first (keep-indexed #(when (and (> %1 start-idx)
                                                   (str/includes? %2 marker-end)) %1) lines)))]
    (when (and start-idx end-idx)
      {:start start-idx :end end-idx})))

(defn- replace-between-markers [content new-content]
  (if-let [{:keys [start end]} (find-marker-positions content)]
    (let [lines (str/split-lines content)
          before (take start lines)
          after (drop (inc end) lines)]
      (str/join "\n" (concat before [new-content] after)))
    ;; No markers found, append to end
    (str content "\n" new-content)))

(defn- install-to-file [file-path new-content]
  (let [existing-content (or (read-file-safe file-path) "")
        new-content-with-markers (str marker-start "\n" (str/replace new-content #"\n$" "") "\n" marker-end)
        updated-content (replace-between-markers existing-content new-content-with-markers)]
    (fs/create-dirs (fs/parent file-path))
    (spit file-path updated-content)
    file-path))

(defn- expand-home [path]
  (str/replace path #"^~" (System/getProperty "user.home")))

(defn- zsh-instructions []
  (render-template "mage/resources/zsh_alias.sh"))

(defn- bash-instructions []
  (render-template "mage/resources/bash_alias.sh"))

(defn- fish-instructions []
  (render-template "mage/resources/fish_alias.sh"))

(defn- fish-function []
  (render-template "mage/resources/fish_function.fish"))

(defn- fish-completions []
  (render-template "mage/resources/fish_completions.fish"))

(defn- install-zsh []
  (let [zshrc (expand-home "~/.zshrc")
        content (zsh-instructions)]
    (install-to-file zshrc content)
    (println (c/green "✓") "Installed mage alias to" zshrc)
    (println "Run:" (c/cyan "source ~/.zshrc") "to activate")))

(defn- install-bash []
  (let [bashrc (expand-home "~/.bashrc")
        content (bash-instructions)]
    (install-to-file bashrc content)
    (println (c/green "✓") "Installed mage alias to" bashrc)
    (println "Run:" (c/cyan "source ~/.bashrc") "to activate")))

(defn- install-fish
  "Fish needs 2 files to get updated."
  []
  (let [conf-dir (expand-home "~/.config/fish/conf.d")
        completions-dir (expand-home "~/.config/fish/completions")
        function-file (str conf-dir "/mage.fish")
        completions-file (str completions-dir "/mage.fish")
        function-content (fish-function)
        completions-content (fish-completions)]
    (install-to-file function-file function-content)
    (install-to-file completions-file completions-content)
    (println (c/green "✓") "Installed mage function to" function-file)
    (println (c/green "✓") "Installed mage completions to" completions-file)
    (println "Fish will automatically load these on next shell start, or run:" (c/cyan "exec fish"))))

(defn print-instructions
  "prints instructions to setup tab-completion for mage."
  [& _]
  (println
   (str/join "\n"
             ["This will install the 'mage' alias as well as tab-completion for your shell."
              ""
              "Installation (automatically manages existing installations):"
              ""
              (str "For " (c/magenta "ZSH") ":")
              "    ./bin/mage alias install zsh"
              ""
              (str "For " (c/red "Bash") ":")
              "    ./bin/mage alias install bash"
              ""
              (str "For " (c/cyan "Fish") ":")
              "    ./bin/mage alias install fish"
              ""
              "Or to just print the alias (for manual installation):"
              "    ./bin/mage alias print <shell-type>"
              ""])))

(defn instructions [{[action shell-type] :arguments}]
  (case action
    "install" (case shell-type
                "zsh" (install-zsh)
                "bash" (install-bash)
                "fish" (install-fish)
                (print-instructions))
    "print" (case shell-type
              "zsh" (do (println (c/cyan "# Add to ~/.zshrc:"))
                        (println (zsh-instructions)))
              "bash" (do (println (c/cyan "# Add to ~/.bashrc:"))
                         (println (bash-instructions)))
              "fish" (do (println (c/cyan "# Add to ~/.config/fish/conf.d/mage.fish:"))
                         (println (fish-function))
                         (println)
                         (println (c/cyan "# Add to ~/.config/fish/completions/mage.fish:"))
                         (println (fish-completions)))
              (print-instructions))
    ;; Backward compatibility: no action means print
    (case action
      "zsh" (println (zsh-instructions))
      "bash" (println (bash-instructions))
      "fish" (println (fish-instructions))
      (print-instructions))))
