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
    "sparse-checkout" "submodule" "switch" "update-index"
    "update-ref" "worktree"})

(defn- git-subcommand-readonly?
  "Returns true if the git subcommand is read-only, false if it writes, nil if unknown."
  [subcommand args]
  (cond
    (git-readonly-subcommands subcommand)
    true

    (git-readonly-with-caveats subcommand)
    true

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

    ;; config: read-only unless --set/--unset/--add/--replace-all/--remove-section/--rename-section
    (= subcommand "config")
    (not (some #(re-matches #"--set|--unset.*|--add|--replace-all|--remove-section|--rename-section|--edit|-e" %) args))

    ;; remote: read-only unless add/remove/rename/set-url/set-head/prune
    (= subcommand "remote")
    (let [remote-sub (first args)]
      (contains? #{"show" "get-url" nil} remote-sub))

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

(defn- gh-api-readonly?
  "Check if a `gh api` call is read-only. GET is read-only, everything else writes."
  [args]
  (let [method-idx (.indexOf ^java.util.List (vec args) "--method")
        method     (when (and (>= method-idx 0) (< (inc method-idx) (count args)))
                     (str/upper-case (nth args (inc method-idx))))
        ;; Also check -X shorthand
        x-idx      (.indexOf ^java.util.List (vec args) "-X")
        x-method   (when (and (>= x-idx 0) (< (inc x-idx) (count args)))
                     (str/upper-case (nth args (inc x-idx))))]
    ;; Default is GET if no method specified
    (let [effective-method (or method x-method "GET")]
      (= effective-method "GET"))))

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
  "Extract the git subcommand and remaining args, skipping global flags like -C and -c."
  [args]
  (loop [remaining args]
    (when (seq remaining)
      (let [arg (first remaining)]
        (cond
          ;; Skip -C <dir> (two-arg global flag)
          (= arg "-C")
          (recur (drop 2 remaining))

          ;; Skip -c key=value (two-arg global flag)
          (= arg "-c")
          (recur (drop 2 remaining))

          ;; Skip --git-dir=... --work-tree=... etc
          (str/starts-with? arg "--git-dir")
          (recur (if (str/includes? arg "=") (rest remaining) (drop 2 remaining)))

          (str/starts-with? arg "--work-tree")
          (recur (if (str/includes? arg "=") (rest remaining) (drop 2 remaining)))

          ;; Skip single-char flags that take no argument
          (and (str/starts-with? arg "-") (not (str/starts-with? arg "--")))
          (recur (rest remaining))

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
                      (let [{:keys [subcommand args]} (parse-git-args args)]
                        (when-not subcommand
                          (println (c/red "No git subcommand provided."))
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
