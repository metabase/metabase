(ns metabase-enterprise.library-branching.pull
  "The pull: the head of the branch into the instance. A pull validates the head first, merges it with the synced
  snapshot of the instance from the base, and applies only the items that have their base content. A local change is
  never written over: it is kept, or it is a conflict that the person resolves. Keep-mine decisions are values that
  the caller holds; [[decide]] adds one."
  (:require
   [metabase-enterprise.library-branching.engine.merge :as merge]
   [metabase-enterprise.library-branching.engine.plan :as plan]
   [metabase-enterprise.library-branching.engine.semantic :as semantic]
   [metabase-enterprise.library-branching.engine.validate :as validate]
   [metabase-enterprise.library-branching.format.claims :as claims]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.roots :as roots]
   [metabase-enterprise.library-branching.settings :as settings]
   [metabase-enterprise.library-branching.store :as store]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------------ Commits ------------------------------------------------------

(defn decode-commit
  "`claims/decode` of the tree of `commit` in `store`, with the codecs `codecs`: `{:snapshot s}`, or
  `{:findings [f ...]}`."
  [store codecs commit]
  (claims/decode codecs (store/read-tree store commit)))

(defn check-commit
  "[[decode-commit]], then the structural findings of its snapshot (`validate/validate`, with the fixed roots of
  `roots/root-ids`): `{:snapshot s}`, or `{:findings [f ...]}`."
  [store codecs commit]
  (let [{s :snapshot :as decoded} (decode-commit store codecs commit)]
    (if-not s
      decoded
      (let [findings (validate/validate s {:roots (roots/root-ids s)})]
        (if (seq findings)
          {:findings findings}
          {:snapshot s})))))

;;; ----------------------------------------------------- Decisions -----------------------------------------------------

(defn decide
  "`decisions` (a vector of keep-mine decisions) with the decision that item `id` keeps the local content `content`
  against head `head`. Decisions accumulate: one decision never removes another."
  [decisions id content head]
  (conj (vec decisions) {:id id :content content :head head}))

(defn decisions-for
  "`{identity content}`: the keep-mine decisions of `decisions` that hold for head `head` and the local snapshot
  `local`. A decision holds only for the head that it was made against, and only while the item has the content that
  it keeps (nil: no item)."
  [decisions head local]
  (into {}
        (keep (fn [{:keys [id content] :as d}]
                (when (and (= head (:head d)) (= content (get local id)))
                  [id content])))
        decisions))

;;; ------------------------------------------------------- Merge -------------------------------------------------------

(defn- lost-base
  "A base snapshot in which each item of `l` and `r` has a content that equals neither side, so that the three-way
  merge treats every difference as a conflict: the merge of a lost base is two-way."
  [l r]
  (zipmap (distinct (concat (keys l) (keys r))) (repeat ::lost)))

(defn held?
  "True iff the pull of head `h` may merge against base commit `b`: `b` is an ancestor of `h`."
  [store b h]
  ;; A base that a remote ref other than the branch holds (after a branch switch) is still a safe merge base; this
  ;; rule does not know it yet, and treats such a base as lost, which gives conflicts and never a lost save.
  (store/ancestor? store b h))

(defn no-base-snapshot
  "The base snapshot of a pull when the instance has no base: empty, so every item of one side only is kept."
  []
  ;; An identity in the trash of the instance should have an unknown base here, so that a delete before the first
  ;; sync is not undone; this rule does not exist yet. With no base, the apply already refuses to write an identity in
  ;; the trash, so a delete during the pull is not undone.
  {})

(defn- base-snapshot
  "`{:snapshot b}` of base commit `b` for head `h`, or `{:lost reason}` when the three-way merge has no base: `b` is not
  [[held?]] (`:rewritten`), or its tree does not decode (`:unreadable`). With no base (nil), [[no-base-snapshot]]."
  [store codecs b h]
  (cond
    (nil? b)                {:snapshot (no-base-snapshot)}
    (not (held? store b h)) {:lost :rewritten}
    :else                   (let [{:keys [snapshot]} (decode-commit store codecs b)]
                              (if snapshot {:snapshot snapshot} {:lost :unreadable}))))

;;; ------------------------------------------------------- Pull --------------------------------------------------------

(def default-retries
  "The number of times that a pull starts again after a stale precondition, and after a rewrite of the branch."
  3)

(defn- apply-merge!
  "Steps 4 to 6 of the pull of head `h` with remote snapshot `r`, against base commit `b`: read, merge, plan and apply,
  again after a stale precondition, at most `retries` times."
  [inst store branch {:keys [codecs decisions retries fence]} b h r base]
  (loop [attempt 0]
    (let [l       (:snapshot (instance/read-snapshot inst))
          lost    (:lost base)
          bs      (or (:snapshot base) (lost-base l r))
          merged  (merge/merge bs l r (decisions-for decisions h l))]
      (if-not (:ok merged)
        (assoc merged :result :conflicts :head h :base-lost lost)
        (let [steps  (plan/plan l (:ok merged) bs)
              result (instance/apply-plan! inst steps {:base     b
                                                       :new-base h
                                                       ;; The base cache holds the content of the base commit `h`,
                                                       ;; which is `r`, never the merge result.
                                                       :digests  (writer/item-digests codecs r)
                                                       :head-ok? #(boolean
                                                                   (when-let [now (store/head store branch)]
                                                                     (store/ancestor? store h now)))
                                                       :fence    (or fence (constantly nil))})]
          (cond
            (:ok result)
            {:result :pulled :head h :steps steps :trashed-in-use (get-in result [:ok :trashed-in-use])}

            (and (:stale result) (< attempt retries))
            (recur (inc attempt))

            (:stale result)    {:result :stale :head h :ids (:stale result)}
            (:fenced result)   {:result :fenced :head h :reason (:fenced result)}
            (:rewritten result) {:result :rewritten :head h}
            (:refused result)  {:result :refused :head h :refused (:refused result)}
            (:key-clash result) {:result :key-clash :head h :key-clash (:key-clash result)}
            :else              {:result :base-moved :head h :base (:base-moved result)}))))))

(defn pull!
  "Pulls the head of branch `branch` of `store` into instance `inst`. Returns one of:

  - `{:result :pulled :head h :steps plan :trashed-in-use m ...}`: the instance holds the merge of the head with its
    local changes, and its base is `h`, with the digests of the content of `h`; `m` is `{identity [user ...]}`, the
    items that the pull moved to the trash and that content outside the Library uses;
  - `{:result :up-to-date :head h}`: the head is the base;
  - `{:result :invalid :head h :findings [f ...]}`: the head does not decode, or breaks a structural rule; the
    instance stays on its base;
  - `{:result :conflicts :head h :conflicts [...] :violations [...] :base-lost reason}`: the merge of `merge/merge`
    failed, and nothing was written. `reason` is nil, `:rewritten` (the base is not in the history of the head) or
    `:unreadable` (the tree of the base does not decode); with a reason, the merge is two-way: every item where the
    instance and the head differ is a conflict;
  - `{:result :stale :head h :ids ids}`: local saves changed the items `ids` during each of the attempts;
  - `{:result :rewritten :head h}`: the branch was rewritten during each of the attempts;
  - `{:result :refused :head h :refused [...]}`: the instance refused a write (`instance/refused`);
  - `{:result :key-clash :head h :key-clash [f ...]}`: a written item has the unique key of a row that stays on the
    instance, a trashed row included (the findings of `apply/key-clashes`);
  - `{:result :base-moved :head h :base actual}`: another task moved the base;
  - `{:result :fenced :head h :reason r}`: `(:fence opts)` returned `r` in the apply (the task may not commit);
  - `{:result :no-branch}`: the branch does not exist, and the instance has a base;
  - `{:result :disabled}`: the setting `library-branching-enabled` is off.

  Every result other than `:pulled` writes nothing. A pulled or invalid result has `:semantic`, the findings of
  `semantic/validate` against `:env`, when `opts` has one. `opts`: `:codecs` (default `kinds/codecs`), `:decisions`
  (the keep-mine decisions, see [[decide]]), `:env` (an environment of `format.manifest`), `:fence` (as in
  `apply/apply-plan`), `:retries` (default [[default-retries]])."
  ([inst store branch]
   (pull! inst store branch {}))
  ([inst store branch opts]
   (let [{:keys [codecs env retries] :as opts} (merge {:codecs kinds/codecs :retries default-retries} opts)]
     (if-not (settings/library-branching-enabled)
       {:result :disabled}
       (loop [rewrites 0]
         (let [b (instance/base inst)
               h (store/head store branch)]
           (cond
             (= b h) {:result :up-to-date :head h}
             (nil? h) {:result :no-branch}
             :else
             (let [{r :snapshot :keys [findings]} (check-commit store codecs h)]
               (if-not r
                 {:result :invalid :head h :findings findings}
                 (let [result (cond-> (apply-merge! inst store branch opts b h r (base-snapshot store codecs b h))
                                env (assoc :semantic (semantic/validate r env)))]
                   (if (and (= :rewritten (:result result)) (< rewrites retries))
                     (recur (inc rewrites))
                     result)))))))))))
