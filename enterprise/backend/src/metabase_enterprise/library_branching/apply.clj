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

(defn satisfied?
  "True iff the item of `step` has the content `content` (nil: not in scope) that the step needs: a write step needs its
  `:pre`; a trash step needs its `:pre`, or an item that is already out of scope."
  [{:keys [pre trash]} content]
  (or (= pre content)
      (and trash (nil? content))))

(defn check-steps
  "`{:stale ids :gone ids}` of the steps of `plan` that have a precondition, in the order of the plan: `:stale`, the
  identities whose item does not satisfy its step ([[satisfied?]]); `:gone`, the identities of the trash steps whose
  item is already out of scope. `current` is `(fn [kind id])`: the content of the item after a lock on it until the
  transaction ends, or nil when it is not in scope."
  [current plan]
  (reduce (fn [acc {:keys [id trash] :as step}]
            (let [content (current (step-kind step) id)]
              (cond
                (not (satisfied? step content)) (update acc :stale conj id)
                (and trash (nil? content))      (update acc :gone conj id)
                :else                           acc)))
          {:stale [] :gone []}
          (filter checked? plan)))

(defn stale-ids
  "The `:stale` identities of [[check-steps]], each once."
  [current plan]
  (vec (distinct (:stale (check-steps current plan)))))

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
  - `{:stale ids}`: the items of `ids` do not satisfy their steps ([[satisfied?]]); no step ran;
  - `{:refused [{:id :reason :message}]}`: the instance refused a step (an `instance/refused` throw);
  - `{:base-moved actual}`: the base is not `:base`;
  - `{:rewritten new-base}`: `(:head-ok? opts)` returned false: the planned head left the branch history.

  A trash step whose item is already out of scope does nothing. The caller rolls its transaction back unless the result
  is `:ok`. `opts`: `:base`, `:new-base`, `:digests`, `:head-ok?` (a function of no argument), and `:fence` (a
  function of no argument that returns nil while the task may commit, else the reason; default: always nil). `ops`:

  - `:current`   `(fn [kind id])`, as in [[check-steps]];
  - `:write!`    `(fn [kind id content])` and `:trash!` `(fn [kind id])`: `instance/write!` and `instance/trash!`;
  - `:stub`      `(fn [kind id content refs])`: the content of a new item without the references `refs`;
  - `:set-base!` `(fn [expected new digests])`: `instance/set-base!`;
  - `:in-use`    `(fn [trashed])`: from `[{:id :kind}]`, the trashed items that content outside the Library uses."
  [ops plan {:keys [base new-base digests head-ok? fence] :or {fence (constantly nil)}}]
  (if-let [reason (fence)]
    {:fenced reason}
    (let [{:keys [stale gone]} (check-steps (:current ops) plan)
          gone                 (set gone)
          plan                 (into [] (remove #(and (:trash %) (contains? gone (:id %)))) plan)]
      (if (seq stale)
        {:stale (vec (distinct stale))}
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
                (throw e)))))))))
