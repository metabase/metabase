(ns mage.bot.git-readonly
  "Proxy for git and gh commands that only allows read-only operations.
   Write operations are rejected with a message to run them directly."
  (:require
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────
;;; git subcommand classification

(def ^:private git-readonly-subcommands
  "git subcommands that are always read-only (do not modify the working tree, index, or refs)."
  #{"blame" "cat-file" "describe" "diff" "diff-tree"
    "for-each-ref" "log" "ls-files" "ls-remote" "ls-tree" "merge-base"
    "name-rev" "rev-list" "rev-parse" "shortlog" "show"
    "show-ref" "status" "version"})

(def ^:private git-readonly-with-caveats
  "git subcommands that are read-only depending on flags."
  ;; fetch writes to local refs but doesn't modify working tree — allow it
  #{"fetch"})

(def ^:private git-write-subcommands
  "git subcommands that modify state — always block."
  #{"add" "am" "apply" "bisect" "checkout" "cherry-pick" "clean" "clone"
    "commit" "gc" "init" "merge" "mv" "notes" "pack-refs" "pull" "push"
    "rebase" "reflog" "replace" "rerere" "reset" "restore" "revert" "rm"
    "sparse-checkout" "switch" "update-index" "update-ref"})

(def ^:private git-fetch-dangerous-flags
  "Flags on `git fetch` that can execute arbitrary commands via the remote helper or pack protocol."
  #{"--upload-pack" "--receive-pack" "--exec"})

(defn- fetch-args-safe?
  "Returns false if any arg is a dangerous --upload-pack/--receive-pack/--exec flag (with or without =value)."
  [args]
  (not (some (fn [a]
               (some (fn [flag]
                       (or (= a flag)
                           (str/starts-with? a (str flag "="))))
                     git-fetch-dangerous-flags))
             args)))

(defn- git-subcommand-readonly?
  "Returns true if the git subcommand is read-only, false if it writes, nil if unknown."
  [subcommand args]
  (cond
    (git-readonly-subcommands subcommand)
    true

    (git-readonly-with-caveats subcommand)
    (fetch-args-safe? args)

    (git-write-subcommands subcommand)
    false

    ;; branch: read-only unless -d/-D/-m/-M/-c/-C/--delete/--move/--copy/--set-upstream
    (= subcommand "branch")
    (not (some #(re-matches #"-[dDmMcC]|--delete|--move|--copy|--set-upstream.*" %) args))

    ;; tag: read-only if listing (no args, -l flag, or only flags that aren't -d/--delete/-f/--force)
    (= subcommand "tag")
    (boolean
     (and (not (some #(re-matches #"-d|--delete|-f|--force" %) args))
          (or (empty? args)
              (some #(re-matches #"-l|--list" %) args)
              (every? #(str/starts-with? % "-") args))))

    ;; stash: "list" and "show" are read-only, everything else writes
    (= subcommand "stash")
    (let [stash-sub (first args)]
      (contains? #{"list" "show" nil} stash-sub))

    ;; config: read iff explicit read flag (--get*, --list, --show-*, --name-only) OR
    ;; at most one positional arg (e.g. `git config user.email` displays the value).
    ;; `git config <key> <value>` (positional set) and any --set/--unset/--add/--edit
    ;; flag are writes.
    (= subcommand "config")
    (let [write-flag? (some #(re-matches #"--set|--set-all|--unset|--unset-all|--add|--replace-all|--remove-section|--rename-section|--edit|-e" %) args)
          read-flag?  (some #(re-matches #"--get|--get-all|--get-regexp|--get-urlmatch|--get-color|--get-colorbool|--list|-l|--show-origin|--show-scope|--name-only" %) args)
          positional  (remove #(str/starts-with? % "-") args)]
      (cond
        write-flag? false
        read-flag?  true
        :else       (<= (count positional) 1)))

    ;; remote: read-only unless add/remove/rename/set-url/set-head/prune
    (= subcommand "remote")
    (let [remote-sub (first args)]
      (contains? #{"show" "get-url" nil} remote-sub))

    ;; worktree: only `list` is read-only
    (= subcommand "worktree")
    (= "list" (first args))

    ;; submodule: `status`, `summary`, and bare `submodule` (defaults to status) are read-only
    (= subcommand "submodule")
    (contains? #{"status" "summary" nil} (first args))

    ;; Unknown subcommand — block to be safe
    :else false))

;;; ──────────────────────────────────────────────
;;; gh subcommand classification

(def ^:private gh-readonly-commands
  "gh command + subcommand pairs that are read-only."
  #{["pr" "view"] ["pr" "list"] ["pr" "checks"] ["pr" "diff"] ["pr" "status"]
    ["issue" "view"] ["issue" "list"] ["issue" "status"]
    ["repo" "view"] ["repo" "list"]
    ["run" "view"] ["run" "list"]
    ["release" "view"] ["release" "list"]
    ["search" "repos"] ["search" "issues"] ["search" "prs"] ["search" "commits"] ["search" "code"]
    ["status" nil]
    ["auth" "status"] ["auth" "token"]})

(def ^:private gh-write-commands
  "gh command + subcommand pairs that modify state."
  #{["pr" "create"] ["pr" "merge"] ["pr" "close"] ["pr" "reopen"] ["pr" "comment"]
    ["pr" "edit"] ["pr" "review"] ["pr" "ready"]
    ["issue" "create"] ["issue" "close"] ["issue" "reopen"] ["issue" "comment"]
    ["issue" "edit"] ["issue" "delete"] ["issue" "transfer"]
    ["repo" "create"] ["repo" "delete"] ["repo" "edit"] ["repo" "fork"] ["repo" "clone"]
    ["run" "rerun"] ["run" "cancel"] ["run" "delete"] ["run" "watch"]
    ["release" "create"] ["release" "delete"] ["release" "edit"]
    ["auth" "login"] ["auth" "logout"]})

(defn- gh-api-input-from-file?
  "Returns true if any arg is `--input @file` or `--input=@file`, which would read arbitrary files into the request body."
  [args]
  (loop [remaining args]
    (when (seq remaining)
      (let [a (first remaining)]
        (cond
          (and (= a "--input")
               (some-> (second remaining) (str/starts-with? "@")))
          true

          (and (str/starts-with? a "--input=")
               (str/starts-with? (subs a (count "--input=")) "@"))
          true

          :else (recur (rest remaining)))))))

(defn- find-method-arg
  "Find the value of --method or -X in args, handling both
   `--method POST` (separate args) and `--method=POST` (single arg) forms."
  [args]
  (loop [remaining args]
    (when (seq remaining)
      (let [a (first remaining)]
        (cond
          (or (= a "--method") (= a "-X"))
          (some-> (second remaining) str/upper-case)

          (str/starts-with? a "--method=")
          (str/upper-case (subs a (count "--method=")))

          (str/starts-with? a "-X=")
          (str/upper-case (subs a (count "-X=")))

          :else (recur (rest remaining)))))))

(defn- gh-api-readonly?
  "Check if a `gh api` call is read-only. GET is read-only, everything else writes.
   Also blocks --input @file which can read arbitrary files into the request body."
  [args]
  (if (gh-api-input-from-file? args)
    false
    (= (or (find-method-arg args) "GET") "GET")))

(defn- gh-command-readonly?
  "Returns true if the gh command is read-only."
  [args]
  (when (seq args)
    (let [cmd     (first args)
          subcmd  (when (> (count args) 1) (second args))
          pair    [cmd subcmd]
          no-sub  [cmd nil]]
      (cond
        ;; gh api — special handling
        (= cmd "api")
        (gh-api-readonly? (rest args))

        ;; Known read-only
        (or (gh-readonly-commands pair) (gh-readonly-commands no-sub))
        true

        ;; Known write
        (or (gh-write-commands pair) (gh-write-commands no-sub))
        false

        ;; Unknown — block to be safe
        :else false))))

;;; ──────────────────────────────────────────────
;;; Entry point

(defn- parse-git-args
  "Extract the git subcommand and remaining args, skipping known-safe global flags.
   Returns {:subcommand ... :args ...} or {:error ...} for rejected flags.

   `-c key=value` is rejected because git config can set knobs that execute commands
   (core.sshCommand, core.gitProxy, http.<url>.proxy, protocol.ext.allow), giving
   arbitrary code execution. Unknown global flags are also rejected."
  [args]
  (loop [remaining args]
    (if-not (seq remaining)
      {:error "No git subcommand provided."}
      (let [arg (first remaining)]
        (cond
          ;; Skip -C <dir> (changes working directory — safe)
          (= arg "-C")
          (recur (drop 2 remaining))

          ;; Reject -c key=value — can set config that executes commands
          (or (= arg "-c") (str/starts-with? arg "-c="))
          {:error (str "Refusing -c flag: 'git -c key=value' can set config "
                       "(core.sshCommand, core.gitProxy, etc.) that executes arbitrary commands.")}

          ;; Skip --git-dir=... / --git-dir <path>
          (or (= arg "--git-dir") (str/starts-with? arg "--git-dir="))
          (recur (if (str/includes? arg "=") (rest remaining) (drop 2 remaining)))

          ;; Skip --work-tree=... / --work-tree <path>
          (or (= arg "--work-tree") (str/starts-with? arg "--work-tree="))
          (recur (if (str/includes? arg "=") (rest remaining) (drop 2 remaining)))

          ;; Reject any other global flag (anything starting with - before a subcommand)
          (str/starts-with? arg "-")
          {:error (str "Refusing unknown global git flag: " arg)}

          ;; Found the subcommand
          :else
          {:subcommand arg :args (vec (rest remaining))})))))

(defn git-readonly!
  "Execute a git or gh command if it's read-only. Reject write operations."
  [{:keys [arguments]}]
  (when (empty? arguments)
    (println (c/red "Usage: ./bin/mage -bot-git-readonly <git|gh> [args...]"))
    (u/exit 1))

  (let [tool (first arguments)
        args (vec (rest arguments))]

    (when-not (#{"git" "gh"} tool)
      (println (c/red (str "Unknown tool: " tool ". Expected 'git' or 'gh'.")))
      (u/exit 1))

    (let [readonly? (if (= tool "git")
                      (let [{:keys [subcommand args error]} (parse-git-args args)]
                        (when error
                          (println (c/red error))
                          (u/exit 1))
                        (git-subcommand-readonly? subcommand args))
                      (gh-command-readonly? args))]

      (when-not readonly?
        (println (c/red "Write operation blocked."))
        (println (str "Run this command directly if you need write access:"))
        (println)
        (println (str "  " tool " " (str/join " " args)))
        (u/exit 1))

      ;; Execute the command
      (let [{:keys [exit out err]} (apply shell/sh* {:quiet? true} tool args)]
        (when (seq out)
          (doseq [line out] (println line)))
        (when (seq err)
          (binding [*out* *err*]
            (doseq [line err] (println line))))
        (when-not (zero? exit)
          (u/exit exit))))))
