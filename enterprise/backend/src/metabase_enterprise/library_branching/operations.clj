(ns metabase-enterprise.library-branching.operations
  "Push, pull and merge-branch on a creation instance, and the deploy on a consumption instance, on the configured
  repository and the app DB instance, each as a task: each start function checks the preconditions of its operation,
  starts its task, and returns the task at once; a worker runs the operation. The result of the operation ends the
  task: an outcome for a success, an error message for every other result."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.library-branching.deploy :as deploy]
   [metabase-enterprise.library-branching.format.manifest :as format.manifest]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.manifest :as manifest]
   [metabase-enterprise.library-branching.merge-branch :as merge-branch]
   [metabase-enterprise.library-branching.pull :as pull]
   [metabase-enterprise.library-branching.push :as push]
   [metabase-enterprise.library-branching.repository :as repository]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase-enterprise.library-branching.settings :as settings]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn instance
  "The app DB instance, with its base keyed by the repository URL."
  []
  (app-db/app-db-instance app-db/kind-stores scope/roots (repository/url)))

(defn instance-env
  "The environment of this instance (`format.manifest/env`), from its manifest: what a deploy validates a head against."
  []
  (format.manifest/env (manifest/manifest)))

;;; --------------------------------------------------- Task results ---------------------------------------------------

(def ^:private disabled-message "Library branching is not enabled.")

(defn- n-of
  "`n` and `word`, in the plural unless `n` is 1."
  [n word]
  (str n " " word (when-not (= 1 n) "s")))

(defn- rules
  "The names of the rules that `findings` break, sorted, each once."
  [findings]
  (str/join ", " (sort (distinct (map (comp name :rule) findings)))))

(defn push-task-result
  "The task result of `result`, a result of `push/push!` on branch `branch`: `{:outcome o}` when the push landed or had
  nothing to push, else `{:error message}`."
  [branch {:keys [result commit findings]}]
  (case result
    ;; a push whose base another task moved is on the branch all the same
    (:pushed :base-moved) {:outcome (push/outcome branch commit)}
    :nothing-to-push      {:outcome {:kind "nothing-to-push" :branch branch :commit commit}}
    :remote-moved         {:error (push/remote-moved-message branch)}
    :invalid              {:error (format "The Library breaks the rules %s, so nothing was pushed." (rules findings))}
    :fenced               {:error "The task ended before the push reached its commit point, so nothing was pushed."}
    :disabled             {:error disabled-message}))

(defn pull-task-result
  "The task result of `result`, a result of `pull/pull!` of branch `branch`: `{:outcome o}` when the pull applied or
  was up to date, else `{:error message}`."
  [branch {:keys [result head steps trashed-in-use findings conflicts violations ids refused]}]
  (case result
    :pulled     {:outcome {:kind    "pulled"
                           :branch  branch
                           :commit  head
                           :count   (count (filter #(or (contains? % :write) (contains? % :trash)) steps))
                           :trashed (count trashed-in-use)}}
    :up-to-date {:outcome {:kind "up-to-date" :branch branch :commit head}}
    :invalid    {:error (format "The head of branch %s breaks the rules %s, so nothing was pulled."
                                branch (rules findings))}
    :conflicts  {:error (format "The pull has %s and %s, so nothing was pulled."
                                (n-of (count conflicts) "conflict") (n-of (count violations) "violation"))}
    :stale      {:error (format "Saves during the pull changed %s, so nothing was pulled. Try again."
                                (n-of (count ids) "item"))}
    :rewritten  {:error (format "The branch %s was rewritten during the pull, so nothing was pulled. Try again."
                                branch)}
    :refused    {:error (format "The instance refused %s (%s), so nothing was pulled."
                                (n-of (count refused) "item") (str/join "; " (map :message refused)))}
    :base-moved {:error "Another task moved the base, so nothing was pulled."}
    :fenced     {:error "The task ended before the pull applied, so nothing was pulled."}
    :no-branch  {:error (format "The repository has no branch %s." branch)}
    :disabled   {:error disabled-message}))

(defn deploy-task-result
  "The task result of `result`, a result of `deploy/deploy!` of branch `branch`: `{:outcome o}` when the deploy applied
  or was up to date, else `{:error message}`."
  [branch {:keys [result head steps trashed-in-use findings ids refused]}]
  (case result
    :deployed   {:outcome {:kind    "deployed"
                           :branch  branch
                           :commit  head
                           :count   (count (filter #(or (contains? % :write) (contains? % :trash)) steps))
                           :trashed (count trashed-in-use)}}
    :up-to-date {:outcome {:kind "up-to-date" :branch branch :commit head}}
    :invalid    {:error (format "The head of branch %s breaks the rules %s, so nothing was deployed."
                                branch (rules findings))}
    :drift      {:error (format "This read-only instance has %s that no commit holds, so nothing was deployed."
                                (n-of (count ids) "changed item"))}
    :stale      {:error (format "Saves during the deploy changed %s, so nothing was deployed. Try again."
                                (n-of (count ids) "item"))}
    :rewritten  {:error (format "The branch %s was rewritten during the deploy, so nothing was deployed. Try again."
                                branch)}
    :refused    {:error (format "The instance refused %s (%s), so nothing was deployed."
                                (n-of (count refused) "item") (str/join "; " (map :message refused)))}
    :base-moved {:error "Another task moved the base, so nothing was deployed."}
    :fenced     {:error "The task ended before the deploy applied, so nothing was deployed."}
    :no-branch  {:error (format "The repository has no branch %s." branch)}
    :disabled   {:error disabled-message}))

(defn merge-branch-task-result
  "The task result of `result`, a result of `merge-branch/merge-branch!` of branch `from` into branch `into`:
  `{:outcome o}` when the merge landed or was up to date, else `{:error message}`."
  [into from {:keys [result commit head conflicts violations foreign findings ref]}]
  (case result
    :merged        {:outcome {:kind "merged" :branch into :from from :commit commit}}
    :up-to-date    {:outcome {:kind "up-to-date" :branch into :from from :commit head}}
    :conflicts     {:error (format "The merge of %s into %s has %s, %s and %s, so nothing was merged."
                                   from into (n-of (count conflicts) "conflict") (n-of (count violations) "violation")
                                   (n-of (count foreign) "conflicting file"))}
    :invalid       {:error (format "%s breaks the rules %s, so nothing was merged."
                                   (if commit (str "Commit " commit) "The merge result") (rules findings))}
    :no-branch     {:error (format "The repository has no branch %s." ref)}
    :no-merge-base {:error (format "The branches %s and %s have no common commit, so nothing was merged." into from)}
    :remote-moved  {:error (format "The branch %s moved during the merge, so nothing was merged. Try again." into)}
    :disabled      {:error disabled-message}))

;;; ------------------------------------------------------ Workers -----------------------------------------------------

(defn push-task!
  "Runs the push to branch `branch` with the commit message `message` (nil: the default) as the work of task `id`, and
  returns its task result ([[push-task-result]])."
  [id branch message]
  (repository/do-with-store
   (fn [s]
     (push-task-result branch (push/push! (instance) s branch id (cond-> {} message (assoc :message message)))))))

(defn pull-task!
  "Runs the pull of branch `branch` as the work of task `id`, and returns its task result ([[pull-task-result]]). The
  apply of the pull commits only while task `id` is running."
  [id branch]
  (repository/do-with-store
   (fn [s]
     (pull-task-result branch (pull/pull! (instance) s branch {:fence (fn [] (tasks/fence id))})))))

(defn deploy-task!
  "Runs the deploy of branch `branch` as the work of task `id`, against the environment of this instance, and returns
  its task result ([[deploy-task-result]]). The apply of the deploy commits only while task `id` is running."
  [id branch]
  (repository/do-with-store
   (fn [s]
     (deploy-task-result branch (deploy/deploy! (instance) s branch (instance-env) {:fence (fn [] (tasks/fence id))})))))

(defn merge-branch-task!
  "Runs the merge of branch `from` into branch `into` as the work of task `id`, and returns its task result
  ([[merge-branch-task-result]])."
  [_id into from]
  (repository/do-with-store
   (fn [s]
     (merge-branch-task-result into from (merge-branch/merge-branch! s into from)))))

;;; ------------------------------------------------------- Starts -----------------------------------------------------

(defn- refuse! [message]
  (throw (ex-info message {:status-code 400})))

(defn- check-start!
  "Throws 400 unless library branching is on and configured, and the instance is a creation instance."
  []
  (when-not (settings/library-branching-enabled)
    (refuse! (tru "Library branching is not enabled.")))
  (when-not (repository/configured?)
    (refuse! (tru "Library branching is not configured.")))
  (when-not (repository/read-write?)
    (refuse! (tru "Push, pull and merge-branch are only allowed when remote-sync-type is read-write."))))

(defn- configured-branch []
  (or (repository/branch)
      (refuse! (tru "Library branching has no branch."))))

(defn- submit!
  "`tasks/submit!` of a task of `kind` for `user-id` with the worker `work`; 400 while a task runs."
  [kind user-id work]
  (try
    (tasks/submit! kind user-id work)
    (catch clojure.lang.ExceptionInfo e
      (if (= ::tasks/in-progress (:type (ex-data e)))
        (refuse! (ex-message e))
        (throw e)))))

(defn start-push!
  "Starts a push task of the synced snapshot to the configured branch, for the user `user-id`, with the commit message
  `message` (nil: the default), and returns the task. Throws ex-info with `:status-code` 400 when library branching is
  off or not configured, on a consumption instance, and while a task runs."
  [user-id message]
  (check-start!)
  (let [branch (configured-branch)]
    (submit! "push" user-id #(push-task! % branch message))))

(defn start-pull!
  "Starts a pull task of the configured branch, for the user `user-id`, and returns the task. The apply of the pull
  commits only while its task is running. Throws as [[start-push!]]."
  [user-id]
  (check-start!)
  (let [branch (configured-branch)]
    (submit! "pull" user-id #(pull-task! % branch))))

(defn start-merge-branch!
  "Starts a task that merges branch `from` into branch `into` (nil: the configured branch), for the user `user-id`, and
  returns the task. Throws as [[start-push!]]."
  [user-id into from]
  (check-start!)
  (let [into (or into (configured-branch))]
    (submit! "merge-branch" user-id #(merge-branch-task! % into from))))

(defn- check-deploy-start!
  "Throws 400 unless library branching is on and configured, and the instance is a consumption instance."
  []
  (when-not (settings/library-branching-enabled)
    (refuse! (tru "Library branching is not enabled.")))
  (when-not (repository/configured?)
    (refuse! (tru "Library branching is not configured.")))
  (when (repository/read-write?)
    (refuse! (tru "Deploy is only allowed when remote-sync-type is read-only."))))

(defn start-deploy!
  "Starts a deploy task of the configured branch, for the user `user-id` (nil: the system), and returns the task. The
  apply of the deploy commits only while its task is running. Throws ex-info with `:status-code` 400 when library
  branching is off or not configured, on a creation instance, with no branch, and while a task runs."
  [user-id]
  (check-deploy-start!)
  (let [branch (configured-branch)]
    (submit! "deploy" user-id #(deploy-task! % branch))))

(defn- deploys?
  "True iff this instance deploys its branch: library branching is on and configured, the instance is a consumption
  instance, and a branch is set."
  []
  (boolean (and (settings/library-branching-enabled)
                (repository/configured?)
                (not (repository/read-write?))
                (repository/branch))))

(defn start-deploy-after-save!
  "Starts a deploy task for the user `user-id` after a save of the settings, and returns it, iff this instance now
  deploys its branch; else nil. Throws as [[start-deploy!]] while a task runs."
  [user-id]
  (when (deploys?)
    (start-deploy! user-id)))

(defn start-initial-deploy!
  "Starts a deploy task for the system, and returns it, iff this instance deploys its branch and has no base yet: the
  first deploy of a consumption instance at boot. Else, and when the start fails, nil; a failure is logged."
  []
  (when (and (deploys?) (nil? (instance/base (instance))))
    (try
      (start-deploy! nil)
      (catch Exception e
        (log/warn e "Library branching could not start the first deploy.")
        nil))))
