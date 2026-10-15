(ns metabase-enterprise.library-branching.tasks-property-test
  "The TaskLease model of the design as a generative test: two workers run pulls and pushes against a remote branch
  and the base row of the app DB, while their workers pause and resume, readers supersede stale tasks, an admin
  cancels, a worker throws, and other people add commits to the branch. Each step goes through the task functions on the app DB. After
  each step the test checks the properties of the model:

  - RowTruthful: a successful task had its effect; a cancelled or failed task had none; an interrupted pull had none;
  - BaseMonotone: the base never moves back in the branch history;
  - at most one task is open;
  - an ended task never changes.

  A command applies to the state that the commands before it made; a command that does not apply to it does nothing.
  So the generator filters nothing, and a shrunk case is a short list of commands. The task functions commit their
  rows, so this test is not parallel."
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase-enterprise.library-branching.tasks-test-util :as tu]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db) features.tu/with-features)

(def ^:private workers [0 1])

(def ^:private op-gen
  (gen/frequency [[8 (gen/return :advance)]
                  [2 (gen/return :pause)]
                  [1 (gen/return :beat)]
                  [1 (gen/return :supersede)]
                  [1 (gen/return :cancel)]
                  [1 (gen/return :crash)]
                  [1 (gen/return :other)]]))

(def command-gen
  "A list of commands `[op worker kind]`. `:advance` starts a task of `kind` on an idle worker, and else runs the next
  step of the worker's task."
  (gen/vector (gen/tuple op-gen (gen/elements workers) (gen/elements ["pull" "push"])) 0 60))

(defn- commit-id [n] (format "%040d" n))

(defn- base [] (instance/base (app-db/app-db-instance)))

(defn- set-base! [expected new] (instance/set-base! (app-db/app-db-instance) expected new {}))

(defn- idle [] {:pc :idle})

(defn- end-worker! [state w]
  (when-let [row (get-in state [:workers w :row])]
    (tasks/fail! row "The worker ended"))
  (assoc-in state [:workers w] (idle)))

(defn- start-task! [state w kind]
  (if (not= :idle (get-in state [:workers w :pc]))
    state
    (let [task (try (tasks/start! kind nil) (catch clojure.lang.ExceptionInfo _ nil))]
      (if-not task
        state
        (-> state
            (assoc-in [:workers w] {:pc   (if (= "pull" kind) :planned :read)
                                    :row  (:id task)
                                    :kind kind
                                    :b    (base)
                                    :h    (peek (:remote state))})
            (update :kinds assoc (:id task) kind))))))

(defn- step! [state w]
  (let [{:keys [pc row b h c]} (get-in state [:workers w])]
    (case pc
      :idle    state
      ;; the apply of a pull: the fence, then the base compare-and-swap from the base that the pull read
      :planned (let [result (tasks/commit! row (fn []
                                                 (let [r (set-base! b h)]
                                                   (if (= :ok r) {:ok true :outcome {:kind "pulled"}} r))))]
                 (end-worker! (cond-> state (contains? result :ok) (update :landed conj row)) w))
      ;; the commit point of a push
      :read    (if (= :ok (tasks/mark-committing! row))
                 (assoc-in state [:workers w :pc] :marked)
                 (end-worker! state w))
      ;; the remote compare-and-swap from the base that the push read
      :marked  (if (= b (peek (:remote state)))
                 (let [c (commit-id (count (:remote state)))]
                   (-> state
                       (update :remote conj c)
                       (update :landed conj row)
                       (update-in [:workers w] assoc :pc :pushed :c c)))
                 (end-worker! state w))
      ;; the record of the push
      :pushed  (do (tasks/record! row (fn [] (set-base! b c) {:outcome {:kind "pushed"}}))
                   (end-worker! state w)))))

(defn- run-command! [state [op w kind]]
  (let [row (get-in state [:workers w :row])]
    (case op
      :advance    (if (= :idle (get-in state [:workers w :pc]))
                    (start-task! state w kind)
                    (step! state w))
      :pause      (do (when row (tu/pause! row)) state)
      :beat       (do (when row (tasks/heartbeat! row)) state)
      :supersede  (do (tasks/supersede-stale!) state)
      :cancel     (do (when row (tasks/cancel! row)) state)
      ;; the worker throws at its current step, and its task ends with the failure
      :crash      (end-worker! state w)
      :other      (update state :remote conj (commit-id (count (:remote state)))))))

(defn- rows []
  (into {} (map (juxt :id :status)) (t2/query {:select [:id :status] :from [:library_branching_task]})))

(defn- violations
  "The properties that the state after a command breaks, given the task statuses `before` the command."
  [state before]
  (let [now     (rows)
        landed? (:landed state)]
    (concat
     (for [[id status] now
           :let [kind (get-in state [:kinds id])]
           :when (case status
                   "successful"             (not (landed? id))
                   ("cancelled" "failed")   (landed? id)
                   "interrupted"            (and (= "pull" kind) (landed? id))
                   false)]
       [:row-truthful id kind status])
     (when (< 1 (count (filter tasks/open-statuses (vals now))))
       [[:one-open-task now]])
     (for [[id status] before
           :when (and (tasks/ended-statuses status) (not= status (get now id)))]
       [:ended-task-changed id status (get now id)])
     (let [position (.indexOf ^java.util.List (:remote state) (base))]
       (when (< position (:base-position state))
         [[:base-moved-back (:base-position state) position]])))))

(defn run-commands!
  "Runs `commands` from a branch with one commit, which is the base, and returns `{:violations [v ...] :at i}` for the
  first command `i` that breaks a property, or nil."
  [commands]
  (tu/with-no-tasks
    (set-base! nil (commit-id 0))
    (loop [state    {:remote        [(commit-id 0)]
                     :workers       (into {} (map (fn [w] [w (idle)])) workers)
                     :landed        #{}
                     :kinds         {}
                     :base-position 0}
           [command & more] commands
           i        0]
      (when command
        (let [before (rows)
              state  (run-command! state command)
              found  (violations state before)]
          (if (seq found)
            {:violations (vec found) :at i :command command}
            (recur (assoc state :base-position (.indexOf ^java.util.List (:remote state) (base)))
                   more
                   (inc i))))))))

;; 400 trials found the overlap of a woken push and a stale pull (the mutation :nocas of the base row) in 10 runs
;; out of 10, in about 7 s on H2.
(defspec task-lease-properties-test 400
  (prop/for-all [commands command-gen]
    (nil? (run-commands! commands))))
