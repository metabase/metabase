(ns metabase-enterprise.library-branching.pull
  "The pull: the head of the branch into the instance. A pull validates the head first, merges it with the synced
  snapshot of the instance from the base, and applies only the items that have their base content. A local change is
  never written over: it is kept, or it is a conflict that the person resolves. Keep-mine decisions are values that
  the caller holds; [[decide]] adds one."
  (:require
   [metabase-enterprise.library-branching.engine.merge :as merge]
   [metabase-enterprise.library-branching.engine.plan :as plan]
   [metabase-enterprise.library-branching.engine.validate :as validate]
   [metabase-enterprise.library-branching.format.claims :as claims]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.roots :as roots]
   [metabase-enterprise.library-branching.settings :as settings]
   [metabase-enterprise.library-branching.store :as store]
   [metabase-enterprise.library-branching.typing :as typing]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------------ Commits ------------------------------------------------------

(def decode-keys
  "The keys of the options of [[decode-opts]]."
  [:table-names :card-ids])

(defn decode-opts
  "The options of `claims/decode` for a tree that instance `inst` reads: a published table of the old format with no
  display name has the name that warehouse sync gives it on `inst`, and the row id of a card in a file of the old
  format names the card of that row on `inst`."
  [inst]
  {:table-names #(instance/table-names inst %)
   :card-ids    #(instance/card-entity-ids inst %)})

(defn decode-commit
  "`claims/decode` of the tree of `commit` in `store`, with the codecs `codecs` and the options `opts` (default none;
  see [[decode-opts]]): `{:snapshot s}`, or `{:findings [f ...]}`."
  ([store codecs commit]
   (decode-commit store codecs commit {}))
  ([store codecs commit opts]
   (claims/decode codecs (store/read-tree store commit) opts)))

(defn check-commit
  "[[decode-commit]] with `opts`, then the structural findings of its snapshot (`validate/validate`, with the fixed
  roots of `roots/root-ids`): `{:snapshot s}`, or `{:findings [f ...]}`."
  ([store codecs commit]
   (check-commit store codecs commit {}))
  ([store codecs commit opts]
   (let [{s :snapshot :as decoded} (decode-commit store codecs commit opts)]
     (if-not s
       decoded
       (let [findings (validate/validate s {:roots (roots/root-ids s)})]
         (if (seq findings)
           {:findings findings}
           {:snapshot s}))))))

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

(defn readable?
  "True iff `commit` is in the local object store of `store`."
  [store commit]
  ;; `ancestor?` reads only the local object store, and throws for a commit that is not in it.
  (try
    (store/ancestor? store commit commit)
    (catch clojure.lang.ExceptionInfo _
      false)))

(defn held?
  "True iff a branch of the remote of `store` holds commit `b`: `b` is the head, or an ancestor of the head, of a branch.
  Then a pull may merge against `b`, also when `b` is not an ancestor of the head that it pulls (a switch of branch).
  `h` is the head of branch `branch` (nil: none), which is checked first; every other branch costs a fresh remote call.
  Call it after a `store/head`, so that the local object store holds the commits of every branch."
  [store b branch h]
  (boolean
   (and (readable? store b)
        (or (and h (store/ancestor? store b h))
            (some (fn [other]
                    (when-let [x (and (not= other branch) (store/head store other))]
                      (store/ancestor? store b x)))
                  (store/branches store))))))

(defn no-base-snapshot
  "The base snapshot of a pull when the instance has no base: empty, so every item of one side only is kept."
  []
  ;; An identity in the trash of the instance should have an unknown base here, so that a delete before the first
  ;; sync is not undone; and the apply should refuse to write an identity in the trash. Neither rule exists yet.
  {})

(defn- base-snapshot
  "`{:snapshot b}` of base commit `b` for head `h` of branch `branch`, decoded with `opts`, or `{:lost reason}` when
  the three-way merge has no base: `b` is not [[held?]] (`:rewritten`), or its tree does not decode (`:unreadable`).
  With no base (nil), [[no-base-snapshot]]."
  [store codecs opts b branch h]
  (cond
    (nil? b)                       {:snapshot (no-base-snapshot)}
    (not (held? store b branch h)) {:lost :rewritten}
    :else                   (let [{:keys [snapshot]} (decode-commit store codecs b opts)]
                              (if snapshot {:snapshot snapshot} {:lost :unreadable}))))

;;; ------------------------------------------------------- Pull --------------------------------------------------------

(def default-retries
  "The number of times that a pull starts again after a stale precondition, and after a rewrite of the branch."
  3)

(defn- apply-merge!
  "Steps 4 to 6 of the pull of head `h` with remote snapshot `r`, against base commit `b`: read, merge, plan and apply,
  again after a stale precondition, at most `retries` times. `(on-read env)` is called with the environment of each
  read of the instance (nil when the read gives none)."
  [inst store branch {:keys [codecs decisions retries fence on-commit]} b h r base on-read]
  (loop [attempt 0]
    (let [{l :snapshot env :env} (instance/read-snapshot inst)
          _       (on-read env)
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
                                                       ;; A plan that merged against `b` needs a branch that still
                                                       ;; holds `b`; a plan of a lost base did not use it.
                                                       :head-ok? #(boolean
                                                                   (when-let [now (store/head store branch)]
                                                                     (and (store/ancestor? store h now)
                                                                          (or lost (nil? b) (held? store b branch now)))))
                                                       :fence     (or fence (constantly nil))
                                                       :on-commit (or on-commit (constantly nil))})]
          (cond
            (:ok result)
            (let [{:keys [trashed-in-use renamed]} (:ok result)]
              (cond-> {:result :pulled :head h :steps steps :trashed-in-use trashed-in-use}
                renamed (assoc :renamed renamed)))

            (and (:stale result) (< attempt retries))
            (recur (inc attempt))

            (:stale result)    {:result :stale :head h :ids (:stale result)}
            (:fenced result)   {:result :fenced :head h :reason (:fenced result)}
            (:rewritten result) {:result :rewritten :head h}
            (:refused result)  {:result :refused :head h :refused (:refused result)}
            :else              {:result :base-moved :head h :base (:base-moved result)}))))))

(defn pull!
  "Pulls the head of branch `branch` of `store` into instance `inst`. Returns one of:

  - `{:result :pulled :head h :steps plan :trashed-in-use m :renamed r ...}`: the instance holds the merge of the head
    with its local changes, and its base is `h`, with the digests of the content of `h`; `m` is `{identity [user
    ...]}`, the items that the pull moved to the trash and that content outside the Library uses; `r` is `{identity
    name}`, the items that the pull moved to the trash with a new name, so that the head could take their keys, and is
    absent when there is none;
  - `{:result :up-to-date :head h}`: the head is the base;
  - `{:result :invalid :head h :findings [f ...]}`: the head does not decode, or breaks a structural rule; the
    instance stays on its base;
  - `{:result :conflicts :head h :conflicts [...] :violations [...] :base-lost reason}`: the merge of `merge/merge`
    failed, and nothing was written. `reason` is nil, `:rewritten` (no branch holds the base: [[held?]]) or
    `:unreadable` (the tree of the base does not decode); with a reason, the merge is two-way: every item where the
    instance and the head differ is a conflict;
  - `{:result :stale :head h :ids ids}`: local saves changed the items `ids` during each of the attempts;
  - `{:result :rewritten :head h}`: during each of the attempts, the branch was rewritten, or the base that the
    merge used left every branch;
  - `{:result :refused :head h :refused [...]}`: the instance refused a write (`instance/refused`);
  - `{:result :base-moved :head h :base actual}`: another task moved the base;
  - `{:result :fenced :head h :reason r}`: `(:fence opts)` returned `r` in the apply (the task may not commit);
  - `{:result :no-branch}`: the branch does not exist, and the instance has a base;
  - `{:result :disabled}`: the setting `library-branching-enabled` is off.

  Every result other than `:pulled` writes nothing. The head and the base decode with [[decode-opts]] of `inst`. A
  result of a pull that read the instance has `:semantic`, the findings of `typing/semantic` of the head against
  `(:env opts)`, else against the environment that the read of the instance gives, when there is one.
  `opts`: `:codecs` (default `kinds/codecs`), `:decisions` (the keep-mine decisions, see [[decide]]), `:env` (an
  environment of `format.manifest`), `:fence` and `:on-commit` (as in `apply/apply-plan`), `:retries` (default
  [[default-retries]])."
  ([inst store branch]
   (pull! inst store branch {}))
  ([inst store branch opts]
   (let [{:keys [codecs env retries] :as opts} (merge {:codecs kinds/codecs :retries default-retries} opts)]
     (if-not (settings/library-branching-enabled)
       {:result :disabled}
       (loop [rewrites 0]
         (let [b       (instance/base inst)
               h       (store/head store branch)
               decoding (decode-opts inst)]
           (cond
             (= b h) {:result :up-to-date :head h}
             (nil? h) {:result :no-branch}
             :else
             (let [{r :snapshot :keys [findings]} (check-commit store codecs h decoding)]
               (if-not r
                 {:result :invalid :head h :findings findings}
                 (let [read-env (volatile! nil)
                       result   (apply-merge! inst store branch opts b h r (base-snapshot store codecs decoding b branch h)
                                              #(vreset! read-env %))
                       env      (or env @read-env)
                       result   (cond-> result
                                  env (assoc :semantic (typing/semantic r env)))]
                   (if (and (= :rewritten (:result result)) (< rewrites retries))
                     (recur (inc rewrites))
                     result)))))))))))
