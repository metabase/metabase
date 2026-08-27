(ns mage.settings-encryption
  "Catch a setting whose at-rest encryption flipped from plaintext (`:encryption :no`) to encrypted
  (`:when-encryption-key-set`) without a migration encrypting its stored values: the strict read would reject the
  plaintext values a released version stored. Dumps the settings of this branch and of a base ref (see
  `dev.settings-encryption`) and diffs them; CI runs it on every PR against the base branch."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [mage.be-dev :as be-dev]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private dev-ns-file "dev/src/dev/settings_encryption.clj")

(defn unmigrated-flips
  "Settings stored plaintext in the `base` dump that the `head` dump reads strictly, minus those a migration in `head`
  encrypts."
  [base head]
  (into (sorted-set)
        (filter (fn [k]
                  (and (= :no (get-in base [:settings k]))
                       (= :when-encryption-key-set (get-in head [:settings k]))
                       (not (contains? (:migrated head) k)))))
        (keys (:settings base))))

(defn- dump-head!
  "Dump this checkout's settings to `out`, via the running dev REPL when there is one."
  [port out]
  (be-dev/eval-or-spawn
   {:port       port
    :nrepl-ns   "dev.settings-encryption"
    :nrepl-code (format "(write-dump! %s)" (pr-str out))
    :jvm-args   ["-X:ee:dev" "dev.settings-encryption/dump!" ":out" (pr-str out)]
    :nrepl-msg  (c/green "Dumping this branch's settings via the running dev REPL...")
    :jvm-msg    (c/yellow "No dev REPL found — starting a JVM for this branch (slower; start your dev REPL for faster runs)...")}))

(defn- dump-base!
  "Dump the settings of `base-ref` to `out` from a throwaway worktree, in a cold JVM."
  [base-ref out]
  (let [dir (str (java.nio.file.Files/createTempDirectory
                  "mb-settings-encryption"
                  (into-array java.nio.file.attribute.FileAttribute [])))]
    (println (c/yellow (str "Starting a JVM for " base-ref " in a temporary worktree...")))
    (try
      (shell/sh {:quiet? true} "git" "worktree" "add" "--detach" dir base-ref)
      ;; the base ref may predate this tool, so dump it with the current code
      (io/copy (io/file dev-ns-file) (io/file dir dev-ns-file))
      (:exit (shell/sh* {:dir dir} "clojure" "-X:ee:dev" "dev.settings-encryption/dump!" ":out" (pr-str out)))
      (finally
        (shell/sh* {:quiet? true} "git" "worktree" "remove" "--force" dir)))))

(defn- report!
  "Print the verdict; returns the exit code."
  [flips base-ref]
  (if (empty? flips)
    (do (println (c/green (str "No setting flipped from plaintext to encrypted without a migration (compared to "
                               base-ref ").")))
        0)
    (do (println (c/red (format (str "%d setting(s) are stored plaintext on %s but read strictly on this branch, and no"
                                     " migration encrypts their existing values:")
                                (count flips) base-ref)))
        (doseq [k flips]
          (println "  " k))
        (println)
        (println (str/join "\n" ["A released version may have stored plaintext values for them, which the strict read rejects."
                                 "Add a migration calling `encrypt-settings` / `decrypt-settings` (see `EncryptSettingsV58` in"
                                 "metabase.app-db.custom-migrations) and list it in `encrypt-settings-migrations`. A setting that"
                                 "never shipped as plaintext still needs the entry; the migration is a no-op with nothing to encrypt."]))
        1)))

(defn cli-check
  "Dump this branch and `--base` (default `master`), then fail if any setting flipped to encrypted without a migration."
  [{:keys [options] :as _parsed}]
  (let [base-ref (or (some-> (:base options) str/trim not-empty) "master")
        port     (some-> (:port options) str str/trim parse-long)
        dir      (doto (io/file "target" "settings-encryption") .mkdirs)
        head-out (.getAbsolutePath (io/file dir "head.edn"))
        base-out (.getAbsolutePath (io/file dir "base.edn"))
        timer    (u/start-timer)
        exit     (let [exit (dump-head! port head-out)]
                   (if (zero? exit)
                     (dump-base! base-ref base-out)
                     exit))
        exit     (if (zero? exit)
                   (report! (unmigrated-flips (edn/read-string (slurp base-out))
                                              (edn/read-string (slurp head-out)))
                            base-ref)
                   (do (println (c/red "Dumping the settings failed; see the output above."))
                       exit))]
    (printf "\nFinished in %.1fs\n" (/ (u/since-ms timer) 1000.0))
    (flush)
    (u/exit exit)))
