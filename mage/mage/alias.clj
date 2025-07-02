(ns mage.alias
  (:require [clojure.string :as str]
            [mage.color :as c]
            [mage.util :as u]
            [selmer.parser :as selmer]))

(defn zsh-instructions []
  (selmer/render
   (slurp "mage/resources/zsh_alias.sh")
   {:mb-dir u/project-root-directory}))

(defn bash-instructions []
  (selmer/render
   (slurp "mage/resources/bash_alias.sh")
   {:mb-dir u/project-root-directory}))

(defn fish-instructions []
  (selmer/render
   (slurp "mage/resources/fish_alias.sh")
   {:mb-dir u/project-root-directory}))

(defn print-instructions
  "prints instructions to setup tab-completion for mage."
  [& _]
  (println
   (str/join "\n"
             ["This will install the 'mage' alias as well as tab-completion for your shell."
              "Quick Setup:"
              ""
              (str "For " (c/magenta "ZSH") ":")
              "    ./bin/mage alias zsh >> ~/.zshrc && source ~/.zshrc"
              ""
              (str "For " (c/red "Bash") ":")
              "    ./bin/mage alias bash >> ~/.bashrc && source ~/.bashrc"
              ""
              (str "For " (c/cyan "Fish") ":")
              "    ./bin/mage alias fish >> ~/.config/fish/completions/bb.fish && source ~/.config/fish/completions/bb.fish"
              ""])))

(defn instructions [{[shell-type] :arguments}]
  (case shell-type
    "zsh" (println (zsh-instructions))
    "bash" (println (bash-instructions))
    "fish" (println (fish-instructions))
    (print-instructions)))
