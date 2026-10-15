(ns metabase-enterprise.library-branching.apply
  "The apply of a plan (`engine.plan/plan`) over the item operations of one instance. Every instance carries out a plan
  with [[apply-plan]], so the rules of the apply are in one place: each step is checked against its precondition under
  a lock before any write, the unique keys of the written items are checked against the rows that stay, the branch head
  is read again before the commit, and the base moves in the same transaction."
  (:require
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.snapshot :as snapshot]))

(set! *warn-on-reflection* true)

(defn- checked?
  "True iff `step` has a precondition: a write or a trash step."
  [step]
  (or (contains? step :write) (contains? step :trash)))

(defn- step-kind
  [{:keys [write pre]}]
  (:kind (or write pre)))

(defn satisfied?
  "True iff `current`, the state of the item of `step` (a value of `instance/current`), meets the precondition of the
  step on an instance that has a base iff `base?`: a write step with a `:pre` needs the live item with that content; a
  write step with no `:pre` needs an absent item, or with a base also a trashed one (a restore); a trash step needs the
  live item with its `:pre`, or an item that is out of scope (trashed or absent)."
  [{:keys [pre trash]} {:keys [state content]} base?]
  (let [live-pre? (and (= :live state) (= pre content))]
    (cond
      trash      (or live-pre? (not= :live state))
      (nil? pre) (or (= :absent state)
                     ;; With no base, a trashed identity has an unknown base: a person may have deleted it during the
                     ;; apply (TLC run v4c), so only an absent item is safe to create.
                     (and base? (= :trashed state)))
      :else      live-pre?)))

(defn check-steps
  "`{:stale ids :gone ids}` of the steps of `plan` that have a precondition, in the order of the plan, on an instance
  that has a base iff `base?`: `:stale`, the identities whose item does not satisfy its step ([[satisfied?]]);
  `:gone`, the identities of the trash steps whose item is already out of scope. `current` is `(fn [kind id])`: the
  state of the item (`instance/current`) after a lock on it until the transaction ends."
  [current plan base?]
  (reduce (fn [acc {:keys [id trash] :as step}]
            (let [state (current (step-kind step) id)]
              (cond
                (not (satisfied? step state base?)) (update acc :stale conj id)
                (and trash (not= :live (:state state))) (update acc :gone conj id)
                :else acc)))
          {:stale [] :gone []}
          (filter checked? plan)))

(defn key-clashes
  "The unique-key findings of the writes of `plan` against the rows that stay: for each write of an item of a kind with
  a unique key (`snapshot/unique-keys`), each other identity of `(key-holders kind k)` that `plan` does not write, as
  `{:rule :unique-key :kind kind :key key :ids #{id other}}`; `k` is the key in its compared form
  (`snapshot/unique-key`), and `key` the key of the written item as it is. A row that `plan` trashes keeps its key, so
  it clashes. `key-holders` gives the identities of every row of the kind whose key has the compared form `k`, the
  trash and rows outside the Library included."
  [key-holders plan]
  (let [written (into #{} (comp (filter :write) (map :id)) plan)]
    (into []
          (mapcat (fn [{:keys [id write]}]
                    (let [kind (:kind write)
                          k    (snapshot/unique-key snapshot/unique-keys write)]
                      (when (some? k)
                        (for [other (sort snapshot/compare-identities (key-holders kind k))
                              :when (not (contains? written other))]
                          {:rule :unique-key
                           :kind kind
                           :key  (get-in write (get-in snapshot/unique-keys [kind :path]))
                           :ids  #{id other}})))))
          (filter :write plan))))

(defn- system-trashes
  "A refusal of each trash step of `plan` whose item is a system item, which no plan may trash."
  [plan]
  (into []
        (keep (fn [{:keys [id trash]}]
                (when (and trash (contains? snapshot/system-ids id))
                  {:id id :reason :system-item :message "A system item of the Library cannot go to the trash."})))
        plan))

(defn- run-steps!
  "Writes, links and trashes the items of `plan`, in its order. An interim step writes its content. A write with
  `:defer` leaves an item that exists as it is, and writes a new one as the stub of its kind; its link step writes the
  whole content. `plan` holds no trash step of an item that is already out of scope."
  [{:keys [write! trash! stub]} plan]
  (let [content-of (into {} (keep (fn [{:keys [id write]}] (when write [id write]))) plan)]
    (doseq [{:keys [id write pre defer link interim trash]} plan]
      (cond
        interim                 (write! (:kind interim) id interim)
        (and write (seq defer)) (when (nil? pre)
                                  (write! (:kind write) id (stub (:kind write) id write defer)))
        write                   (write! (:kind write) id write)
        link                    (let [content (content-of id)]
                                  (write! (:kind content) id content))
        trash                   (trash! (:kind pre) id)))))

(defn apply-plan
  "Carries out `plan` with the item operations `ops`, in the caller's transaction, and returns one of:

  - `{:ok {:trashed-in-use m}}`: every step ran, and the base moved from `:base` to `:new-base` with `:digests`; `m` is
    `{identity [user ...]}`, the items that the apply trashed and that content outside the Library uses, from
    `(:in-use ops)`;
  - `{:fenced reason}`: `(:fence opts)` returned `reason`: the task of the apply may not commit; no step ran;
  - `{:refused [{:id :reason :message}]}`: a step trashes a system item (reason `:system-item`), and no step ran; or
    the instance refused a step (an `instance/refused` throw);
  - `{:stale ids}`: the items of `ids` do not satisfy their steps ([[satisfied?]]); no step ran;
  - `{:key-clash findings}`: the findings of [[key-clashes]]; no step ran;
  - `{:base-moved actual}`: the base is not `:base`;
  - `{:rewritten new-base}`: `(:head-ok? opts)` returned false: the planned head left the branch history.

  A trash step whose item is already out of scope does nothing. The caller rolls its transaction back unless the result
  is `:ok`. `opts`: `:base` (nil: the instance has no base), `:new-base`, `:digests`, `:head-ok?` (a function of no
  argument), `:fence` (a function of no argument that returns nil while the task may commit, else the reason;
  default: always nil), and `:on-commit` (a function of no argument that is called last, only for an `:ok` result, so
  that its writes commit with the apply; default: none). `ops`:

  - `:current`     `(fn [kind id])`, as in [[check-steps]];
  - `:key-holders` `(fn [kind k])`, as in [[key-clashes]];
  - `:write!`      `(fn [kind id content])` and `:trash!` `(fn [kind id])`: `instance/write!` and `instance/trash!`;
  - `:stub`        `(fn [kind id content refs])`: the content of a new item without the references `refs`;
  - `:set-base!`   `(fn [expected new digests])`: `instance/set-base!`;
  - `:in-use`      `(fn [trashed])`: from `[{:id :kind}]`, the trashed items that content outside the Library uses."
  [ops plan {:keys [base new-base digests head-ok? fence on-commit] :or {fence (constantly nil) on-commit (constantly nil)}}]
  (if-let [reason (fence)]
    {:fenced reason}
    (if-let [refused (seq (system-trashes plan))]
      {:refused (vec refused)}
      (let [{:keys [stale gone]} (check-steps (:current ops) plan (some? base))
            gone                 (set gone)
            plan                 (into [] (remove #(and (:trash %) (contains? gone (:id %)))) plan)
            clashes              (when (empty? stale) (key-clashes (:key-holders ops) plan))]
        (cond
          (seq stale)   {:stale (vec (distinct stale))}
          (seq clashes) {:key-clash clashes}
          :else         (try
                          (run-steps! ops plan)
                          (let [moved ((:set-base! ops) base new-base digests)]
                            (if (not= :ok moved)
                              {:base-moved (:moved moved)}
                              (let [in-use ((:in-use ops) (into [] (comp (filter :trash) (map (fn [{:keys [id pre]}] {:id id :kind (:kind pre)}))) plan))]
                                ;; The head is read last, so that the window between this check and the commit is as
                                ;; short as it can be.
                                (if (head-ok?)
                                  ;; Last: a write that an app DB rollback cannot undo in full (a setting keeps its new
                                  ;; value in the cache of this process) happens only when nothing more can refuse the
                                  ;; apply.
                                  (do (on-commit)
                                      {:ok {:trashed-in-use in-use}})
                                  {:rewritten new-base}))))
                          (catch clojure.lang.ExceptionInfo e
                            (let [{:keys [type reason id]} (ex-data e)]
                              (if (= ::instance/refused type)
                                {:refused [{:id id :reason reason :message (ex-message e)}]}
                                (throw e))))))))))
