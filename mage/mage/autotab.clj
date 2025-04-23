(ns mage.autotab
  (:require [clojure.string :as str]))

(defn zsh-instructions []
  (->> ["_bb_tasks() {"
        "    local matches=(`bb tasks |tail -n +3 |cut -f1 -d ' '`)"
        "    compadd -a matches"
        "    _files # autocomplete filenames as well"
        "}"
        "compdef _bb_tasks mage"]
       (str/join "\n")))

(defn bash-instructions []
  (->> ["_bb_tasks() {"
        "    COMPREPLY=( $(compgen -W \"$(bb tasks |tail -n +3 |cut -f1 -d ' ')\" -- ${COMP_WORDS[COMP_CWORD]}) );"
        "}"
        "# autocomplete filenames as well"
        "complete -f -F _bb_tasks mage"]
       (str/join "\n")))

(defn fish-instructions []
  (->> ["function __bb_complete_tasks"
        "  if not test \"$__bb_tasks\""
        "    set -g __bb_tasks (bb tasks |tail -n +3 |cut -f1 -d ' ')"
        "  end"
        ""
        "  printf \"%s\n\" $__bb_tasks"
        "end"
        ""
        "complete -c mage -a \"(__bb_complete_tasks)\" -d 'tasks'"]
       (str/join "\n")))

(defn print-instructions
  "prints instructions to setup tab-completion for mage."
  [& _]
  (println
   "# Terminal tab-completion

## zsh
- Add this to your .zshrc to get tab-complete feature on ZSH.
```
"
   (zsh-instructions)
   "
```

## bash
- Add this to your .bashrc to get tab-complete feature on bash.
```
"
   (bash-instructions)
   "
```

## fish
- Add this to your .config/fish/completions/bb.fish to get tab-complete feature on Fish shell.
```
"
   (fish-instructions)
   "
```

Quick Setup:

For ZSH: ./bin/mage setup-autocomplete zsh >> ~/.zshrc
For Bash: ./bin/mage setup-autocomplete bash >> ~/.bashrc
For Fish: ./bin/mage setup-autocomplete fish >> ~/.config/fish/completions/bb.fish
"))

(defn instructions [{[shell-type] :arguments}]
  (case shell-type
    "zsh" (println (zsh-instructions))
    "bash" (println (bash-instructions))
    "fish" (println (fish-instructions))
    (print-instructions)))
