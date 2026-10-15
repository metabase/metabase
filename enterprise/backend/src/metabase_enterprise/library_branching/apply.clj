(ns metabase-enterprise.library-branching.apply
  "The apply of a plan (`engine.plan/plan`) over the item operations of one instance. Every instance carries out a plan
  with [[apply-plan]], so the rules of the apply are in one place: each step is checked against its precondition under
  a lock before any write, the branch head is read again before the commit, and the base moves in the same
  transaction."
  (:require
   [metabase-enterprise.library-branching.instance :as instance]))

(set! *warn-on-reflection* true)

(defn- checked?
  "True iff `step` has a precondition: a write or a trash step."
  [step]
  (or (contains? step :write) (contains? step :trash)))

(defn- step-kind
  [{:keys [write pre]}]
  (:kind (or write pre)))

(defn stale-ids
  "The identities of the steps of `plan` whose item does not have the content of the step's `:pre` now, in the order of
  the plan. `current` is `(fn [kind id])`: the content of the item after a lock on it until the transaction ends, or
  nil when it is not in scope."
  [current plan]
  (into []
        (comp (filter checked?)
              (remove (fn [{:keys [id pre] :as step}] (= pre (current (step-kind step) id))))
              (map :id)
              (distinct))
        plan))

(defn- run-steps!
  "Writes, links and trashes the items of `plan`, in its order. A write with `:defer` leaves an item that exists as it
  is, and writes a new one as the stub of its kind; its link step writes the whole content."
  [{:keys [write! trash! stub]} plan]
  (let [content-of (into {} (keep (fn [{:keys [id write]}] (when write [id write]))) plan)]
    (doseq [{:keys [id write pre defer link trash]} plan]
      (cond
        (and write (seq defer)) (when (nil? pre)
                                  (write! (:kind write) id (stub (:kind write) id write defer)))
        write                   (write! (:kind write) id write)
        link                    (let [content (content-of id)]
                                  (write! (:kind content) id content))
        trash                   (trash! (:kind pre) id)))))

(defn apply-plan
  "Carries out `plan` with the item operations `ops`, in the caller's transaction, and returns one of:

  - `{:ok {:trashed-in-use m}}`: every step ran, and the base moved from `:base` to `:new-base` with `:digests`; `m` is
    `{identity [user ...]}`, the trashed items that content outside the Library uses, from `(:in-use ops)`;
  - `{:stale ids}`: the items of `ids` do not have the content of their precondition; no step ran;
  - `{:refused [{:id :reason :message}]}`: the instance refused a step (an `instance/refused` throw);
  - `{:base-moved actual}`: the base is not `:base`;
  - `{:rewritten new-base}`: `(:head-ok? opts)` returned false: the planned head left the branch history.

  The caller rolls its transaction back unless the result is `:ok`. `ops`:

  - `:current`   `(fn [kind id])`, as in [[stale-ids]];
  - `:write!`    `(fn [kind id content])` and `:trash!` `(fn [kind id])`: `instance/write!` and `instance/trash!`;
  - `:stub`      `(fn [kind id content refs])`: the content of a new item without the references `refs`;
  - `:set-base!` `(fn [expected new digests])`: `instance/set-base!`;
  - `:in-use`    `(fn [trashed])`: from `[{:id :kind}]`, the trashed items that content outside the Library uses."
  [ops plan {:keys [base new-base digests head-ok?]}]
  (let [stale (stale-ids (:current ops) plan)]
    (if (seq stale)
      {:stale stale}
      (try
        (run-steps! ops plan)
        (let [moved ((:set-base! ops) base new-base digests)]
          (if (not= :ok moved)
            {:base-moved (:moved moved)}
            (let [in-use ((:in-use ops) (into [] (comp (filter :trash) (map (fn [{:keys [id pre]}] {:id id :kind (:kind pre)}))) plan))]
              ;; The head is read last, so that the window between this check and the commit is as short as it can be.
              (if (head-ok?)
                {:ok {:trashed-in-use in-use}}
                {:rewritten new-base}))))
        (catch clojure.lang.ExceptionInfo e
          (let [{:keys [type reason id]} (ex-data e)]
            (if (= ::instance/refused type)
              {:refused [{:id id :reason reason :message (ex-message e)}]}
              (throw e))))))))
