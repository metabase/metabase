(ns mage.security-lint
  (:require
   [clojure.string :as str]
   [mage.kondo :as kondo]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn- clojure-file? [f] (re-find #"\.clj[cs]?$" f))

(defn changed-files
  "Files to report on for `--branch` (changed vs `base`, `origin/master` by default) or `--uncommitted` (changed
  vs `HEAD`, plus untracked).

  The scan still analyzes the whole tree -- taint and reachability are whole-program -- and only the *report* is
  narrowed. The diff is three-dot, `base...HEAD`: what HEAD changed since its merge-base with `base`. A pull
  request in CI checks out GitHub's merge commit, whose first parent is the base tip, and passes `HEAD^1`."
  [mode base]
  (let [diffed (case mode
                 :branch      (u/updated-files (str (or base "origin/master") "...HEAD"))
                 :uncommitted (u/updated-files "HEAD"))
        untracked (when (= mode :uncommitted)
                    (->> (shell/sh {:quiet? true} "git" "ls-files" "--others" "--exclude-standard")
                         (remove str/blank?)))]
    (->> (concat diffed untracked) (filter clojure-file?) distinct vec)))

(defn- scan-opts
  "Options map handed to `dev.security-lint/scan`, built from the parsed CLI arguments."
  [{:keys [options arguments]}]
  (cond-> {}
    (seq arguments)        (assoc :paths (vec arguments))
    (:sarif options)       (assoc :sarif-out (:sarif options))
    (:taint options)       (assoc :taint-sources (keyword (:taint options)))
    (:branch options)      (assoc :only-files (changed-files :branch (:base options)))
    (:uncommitted options) (assoc :only-files (changed-files :uncommitted nil))))

(defn- run-scan
  "Run the scan in a fresh JVM; `dev.security-lint/cli!` sets the exit code.

  A fresh JVM every time, on purpose. Scanning through the running dev REPL saved about eight seconds of a
  thirty-second run and cost three stale-state bugs in one afternoon: rules kept under old ids, an edited reporter
  not running, a registry emptied by a reload. CI has no REPL, so a fresh JVM is also the only path that runs there,
  and the one path is what gets exercised."
  [opts warn-only?]
  (let [args (into ["-X:dev" "dev.security-lint/cli!"]
                   (mapcat (fn [[k v]] [(str k) (pr-str v)]))
                   (cond-> opts warn-only? (assoc :warn-only true)))]
    (:exit (apply shell/sh* "clojure" args))))

(defn cli-scan
  "Run the backend security rules over `paths` (default: src, enterprise/backend/src and each driver module's src).

  Exits non-zero when an `:error`-severity finding is present, unless `--warn-only` is passed."
  [{:keys [options] :as parsed}]
  ;; clj-kondo analyzes library macros through the configs it copies from dependencies into .clj-kondo/imports,
  ;; which git ignores. A fresh checkout without them analyzes differently and the scan's output changes -- one
  ;; finding's severity did, in a throwaway worktree. Ensure them the way the kondo task does.
  (kondo/copy-configs-if-needed!)
  (let [timer (u/start-timer)
        exit  (run-scan (scan-opts parsed) (boolean (:warn-only options)))]
    (printf "\nFinished in %.1fs\n" (/ (u/since-ms timer) 1000.0))
    (flush)
    (u/exit (or exit 0))))
