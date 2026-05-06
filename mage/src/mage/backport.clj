(ns mage.backport
  "Backport a merged PR to a `release-x.<version>.x` branch via cherry-pick.

  Mirrors `.github/actions/create-backport/action.yml` but runs locally:
  looks up the PR's merge commit via `gh`, creates a `backport-<v>-<sha>`
  branch from `origin/release-x.<v>.x`, and cherry-picks. Stops after the
  cherry-pick — pushing and opening the PR is left to you."
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]))

(set! *warn-on-reflection* true)

(defn- die! [msg]
  (println (c/red msg))
  #_{:clj-kondo/ignore [:discouraged-java-method]}
  (System/exit 1))

(defn- working-tree-clean?
  "Tracked tree is clean (untracked files are fine — they survive checkouts)."
  []
  (and (zero? (:exit (shell/sh* {:quiet? true} "git" "diff" "--quiet")))
       (zero? (:exit (shell/sh* {:quiet? true} "git" "diff" "--cached" "--quiet")))))

(defn- current-branch []
  (str/trim (first (shell/sh {:quiet? true} "git" "rev-parse" "--abbrev-ref" "HEAD"))))

(defn- ref-exists? [ref]
  (zero? (:exit (shell/sh* {:quiet? true} "git" "rev-parse" "--verify" "--quiet" ref))))

(defn- gh-pr-info [pr-number]
  (let [{:keys [exit out err]} (shell/sh* {:quiet? true}
                                          "gh" "pr" "view" (str pr-number)
                                          "--json" "number,title,mergeCommit,state,author")]
    (when-not (zero? exit)
      (die! (str "gh pr view failed: " (str/join "\n" (concat out err)))))
    (json/parse-string (str/join "\n" out) true)))

(defn backport
  "Cherry-pick a merged PR onto a release branch."
  [{:keys [arguments options]}]
  (let [[pr-number-str target-version-str] arguments
        pr-number      (parse-long pr-number-str)
        target-version (parse-long target-version-str)
        target-branch  (format "release-x.%d.x" target-version)
        remote-ref     (str "origin/" target-branch)
        open-pr?       (boolean (:pr options))
        push?          (or open-pr? (boolean (:push options)))]
    (when-not (working-tree-clean?)
      (die! "Working tree has uncommitted/staged changes. Commit or stash them first."))
    (println (c/green (format "Fetching origin (looking for %s)..." target-branch)))
    (shell/sh "git" "fetch" "origin" target-branch)
    (when-not (ref-exists? remote-ref)
      (die! (format "%s does not exist on origin." target-branch)))
    (let [{:keys [title state mergeCommit author]} (gh-pr-info pr-number)
          commit       (:oid mergeCommit)
          author-login (:login author)]
      (when-not (= state "MERGED")
        (die! (format "PR #%d is %s, not MERGED. Refusing to backport." pr-number state)))
      (when-not commit
        (die! (format "Could not determine merge commit for PR #%d." pr-number)))
      (let [short-sha       (subs commit 0 12)
            backport-branch (format "backport-%d-%s" target-version short-sha)
            saved-branch    (current-branch)
            gh-title        (format "🤖 backported \"%s\"" title)
            gh-body         (str "#" pr-number)
            assignee        (or author-login "@me")]
        (when (ref-exists? backport-branch)
          (die! (format "Branch %s already exists locally. Delete it (git branch -D %s) and retry."
                        backport-branch backport-branch)))
        (println (c/cyan (format "PR #%d: %s" pr-number title)))
        (println (c/cyan (format "Merge commit: %s" commit)))
        (println (c/cyan (format "Creating %s from %s..." backport-branch remote-ref)))
        (shell/sh "git" "checkout" "-B" backport-branch remote-ref)
        (println (c/cyan (format "Cherry-picking %s..." short-sha)))
        (let [{:keys [exit]} (shell/sh* "git" "cherry-pick" commit)]
          (if (zero? exit)
            (do
              (println (c/green (format "✓ Clean cherry-pick onto %s." backport-branch)))
              (if push?
                (do
                  (println (c/cyan (format "Pushing %s to origin..." backport-branch)))
                  (shell/sh "git" "push" "-u" "origin" backport-branch))
                (do
                  (println (c/yellow "Skipping push (pass --push or --pr to do it automatically)."))
                  (println (format "  git push -u origin %s" backport-branch))))
              (if open-pr?
                (do
                  (println (c/cyan "Opening backport PR..."))
                  (shell/sh "gh" "pr" "create"
                            "--base" target-branch
                            "--head" backport-branch
                            "--label" "was-backported"
                            "--assignee" assignee
                            "--title" gh-title
                            "--body" gh-body))
                (when-not open-pr?
                  (println (c/yellow "Skipping PR creation (pass --pr to do it automatically)."))
                  (println (format "  gh pr create --base %s --head %s \\"
                                   target-branch backport-branch))
                  (println (format "    --label was-backported --assignee %s \\" assignee))
                  (println (format "    --title %s \\" (pr-str gh-title)))
                  (println (format "    --body %s" (pr-str gh-body)))))
              (println (c/cyan (format "Returning to %s..." saved-branch)))
              (shell/sh "git" "checkout" saved-branch)
              (println (c/green (format "✓ Done. Backport branch: %s" backport-branch))))
            (do
              (println)
              (println (c/yellow (format "Cherry-pick produced conflicts on %s. Resolve them, then:"
                                         backport-branch)))
              (println "  git add <files>")
              (println "  git cherry-pick --continue")
              (println (format "  git push -u origin %s" backport-branch))
              (println (format "  gh pr create --base %s --head %s \\"
                               target-branch backport-branch))
              (println (format "    --label was-backported --assignee %s \\" assignee))
              (println (format "    --title %s \\" (pr-str gh-title)))
              (println (format "    --body %s" (pr-str gh-body)))
              (println)
              (println (c/yellow "To abort and return to your previous branch:"))
              (println "  git cherry-pick --abort")
              (println (format "  git checkout %s" saved-branch))
              (println (format "  git branch -D %s" backport-branch)))))))))
