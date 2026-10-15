(ns metabase-enterprise.library-branching.operations
  "Push, pull, merge-branch and the branch operations (create a branch, push to a new branch, switch to another
  branch) on a creation instance, and the deploy on a consumption instance, on the configured repository and the app DB
  instance, each as a task: each start function checks the preconditions of its operation, starts its task, and
  returns the task at once; a worker runs the operation. The result of the operation ends the task: an outcome for a
  success, an error message for every other result. A branch operation writes the branch setting only when it
  succeeds, in the transaction that ends it."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.library-branching.branch :as branch]
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
   [metabase-enterprise.library-branching.store.jgit :as store.jgit]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase.settings.core :as setting]
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
  "The names of the rules that `findings` break, sorted, each once. A finding of the format names its rule by `:type`."
  [findings]
  (str/join ", " (sort (distinct (map (fn [{:keys [rule type]}] (name (or rule type))) findings)))))

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
    :branch-exists        {:error (format "The repository already has a branch %s, so nothing was pushed." branch)}
    :fenced               {:error "The task ended before the push reached its commit point, so nothing was pushed."}
    :disabled             {:error disabled-message}))

(defn- key-clash-message
  "The error message of the key clash findings `key-clash` of the head of branch `branch`, when nothing was `verb`
  (\"pulled\", \"deployed\")."
  [branch key-clash verb]
  (str "The head of branch " branch " gives " (n-of (count key-clash) "item") " the name of another item on this "
       "instance, also one in the trash (" (str/join ", " (map (comp pr-str :key) key-clash)) "), so nothing was "
       verb "."))

(defn pull-task-result
  "The task result of `result`, a result of `pull/pull!` of branch `branch`: `{:outcome o}` when the pull applied or
  was up to date, else `{:error message}`."
  [branch {:keys [result head steps trashed-in-use findings conflicts violations ids refused key-clash]}]
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
    :key-clash  {:error (key-clash-message branch key-clash "pulled")}
    :base-moved {:error "Another task moved the base, so nothing was pulled."}
    :fenced     {:error "The task ended before the pull applied, so nothing was pulled."}
    :no-branch  {:error (format "The repository has no branch %s." branch)}
    :disabled   {:error disabled-message}))

(defn switch-task-result
  "The task result of `result`, a result of `pull/pull!` of branch `branch` for a switch to it: as
  [[pull-task-result]], with the outcome kind switched."
  [branch result]
  (let [task-result (pull-task-result branch result)]
    (cond-> task-result
      (:outcome task-result) (assoc-in [:outcome :kind] "switched"))))

(defn create-branch-task-result
  "The task result of `result`, a result of `branch/create-branch!` of branch `branch-name` from branch `from`:
  `{:outcome o}` when the branch was created, else `{:error message}`."
  [branch-name from {:keys [result commit ref]}]
  (case result
    :created       {:outcome {:kind "branch-created" :branch branch-name :from from :commit commit}}
    :branch-exists {:error (format "The repository already has a branch %s." branch-name)}
    :no-branch     {:error (format "The repository has no branch %s." ref)}
    :fenced        {:error "The task ended before the branch was created, so nothing changed."}))

(defn deploy-task-result
  "The task result of `result`, a result of `deploy/deploy!` of branch `branch`: `{:outcome o}` when the deploy applied
  or was up to date, else `{:error message}`."
  [branch {:keys [result head steps trashed-in-use findings ids refused key-clash]}]
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
    :key-clash  {:error (key-clash-message branch key-clash "deployed")}
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

(defn- write-branch!
  [branch]
  (setting/set! :remote-sync-branch branch))

(defn push-task!
  "Runs the push to branch `branch` with the commit message `message` (nil: the default) as the work of task `id`, and
  returns its task result ([[push-task-result]]). With `(:new-branch? opts)`, the push creates `branch`, and the
  branch setting becomes `branch` in the record step of the push, with the move of the base."
  ([id branch message]
   (push-task! id branch message {}))
  ([id branch message {:keys [new-branch?]}]
   (repository/do-with-store
    (fn [s]
      (push-task-result branch (push/push! (instance) s branch id
                                           (cond-> {}
                                             message     (assoc :message message)
                                             new-branch? (assoc :new-branch? true
                                                                :on-record #(write-branch! branch)))))))))

(defn pull-task!
  "Runs the pull of branch `branch` as the work of task `id`, and returns its task result ([[pull-task-result]]). The
  apply of the pull commits only while task `id` is running."
  [id branch]
  (repository/do-with-store
   (fn [s]
     (pull-task-result branch (pull/pull! (instance) s branch {:fence (fn [] (tasks/fence id))})))))

(defn switch-task!
  "Runs the switch of the instance to branch `branch` as the work of task `id`, and returns its task result
  ([[switch-task-result]]). The switch is the pull of `branch`: it merges against the base while a branch holds the
  base, also when the base is not in the history of `branch`. The branch setting becomes `branch` in the transaction
  of the apply, or, when the head of `branch` is the base, in a commit of the task; both commit only while task `id`
  is running."
  [id branch]
  (repository/do-with-store
   (fn [s]
     (let [{:keys [result head] :as pulled} (pull/pull! (instance) s branch {:fence     (fn [] (tasks/fence id))
                                                                             :on-commit #(write-branch! branch)})]
       (cond
         (not= :up-to-date result) (switch-task-result branch pulled)
         ;; with no base, a branch that does not exist is "up to date"
         (nil? head)               (switch-task-result branch {:result :no-branch})
         :else
         (let [task-result (switch-task-result branch pulled)
               committed   (tasks/commit! id (fn []
                                               (write-branch! branch)
                                               {:ok true :outcome (:outcome task-result)}))]
           (if (:fenced committed)
             (switch-task-result branch {:result :fenced :reason committed})
             task-result)))))))

(defn create-branch-task!
  "Runs the creation of branch `branch-name` at the head of branch `from` as the work of task `id`, and returns its task
  result ([[create-branch-task-result]]). The task passes its commit point before the remote changes, and the branch
  setting becomes `branch-name` in the record step of the task. The base does not change: a branch still holds it."
  [id branch-name from]
  (repository/do-with-store
   (fn [s]
     (let [result      (branch/create-branch! s branch-name from {:commit-point #(let [r (tasks/mark-committing! id)]
                                                                                   (when-not (= :ok r) r))})
           task-result (create-branch-task-result branch-name from result)]
       (when (= :created (:result result))
         (tasks/record! id (fn [] (write-branch! branch-name) task-result)))
       task-result))))

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
    (refuse! (tru "Push, pull, merge-branch and the branch operations are only allowed when remote-sync-type is read-write."))))

(defn- check-branch-settable!
  "Throws 400 when the branch setting comes from an environment variable: a write of it would not change it."
  []
  (when (= :env (setting/get-raw-value-source :remote-sync-branch))
    (refuse! (tru "The branch comes from the environment variable MB_REMOTE_SYNC_BRANCH, so it does not change."))))

(defn- check-branch-name!
  [branch-name]
  (when-not (store.jgit/valid-branch-name? branch-name)
    (refuse! (tru "The name {0} is not a valid branch name." branch-name))))

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
  `message` (nil: the default), and returns the task. With `new-branch` (not nil), the push creates the branch
  `new-branch` instead, and the instance uses it after the push. Throws ex-info with `:status-code` 400 when library
  branching is off or not configured, on a consumption instance, and while a task runs; for a new branch, also when
  `new-branch` is not a valid branch name and when the branch setting comes from an environment variable."
  ([user-id message]
   (start-push! user-id message nil))
  ([user-id message new-branch]
   (check-start!)
   (if new-branch
     (do (check-branch-settable!)
         (check-branch-name! new-branch)
         (submit! "push" user-id #(push-task! % new-branch message {:new-branch? true})))
     (let [branch (configured-branch)]
       (submit! "push" user-id #(push-task! % branch message))))))

(defn start-switch!
  "Starts a task that switches the instance to branch `branch` (`switch-task!`), for the user `user-id`, and returns
  the task. Throws as [[start-push!]] for a new branch, except for the name."
  [user-id branch]
  (check-start!)
  (check-branch-settable!)
  (submit! "branch-switch" user-id #(switch-task! % branch)))

(defn start-pull!
  "Starts a pull task of the configured branch, for the user `user-id`, and returns the task. The apply of the pull
  commits only while its task is running. A pull of `branch`, another branch than the configured one, is a switch to
  it ([[start-switch!]]). Throws as [[start-push!]]."
  ([user-id]
   (start-pull! user-id nil))
  ([user-id branch]
   (check-start!)
   (let [configured (configured-branch)]
     (if (and branch (not= branch configured))
       (start-switch! user-id branch)
       (submit! "pull" user-id #(pull-task! % configured))))))

(defn start-create-branch!
  "Starts a task that creates branch `branch-name` at the head of branch `from` (nil: the configured branch), for the
  user `user-id`, and returns the task; the instance uses the new branch after it. Throws as [[start-push!]] for a new
  branch."
  [user-id branch-name from]
  (check-start!)
  (check-branch-settable!)
  (check-branch-name! branch-name)
  (let [from (or from (configured-branch))]
    (submit! "branch-create" user-id #(create-branch-task! % branch-name from))))

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
