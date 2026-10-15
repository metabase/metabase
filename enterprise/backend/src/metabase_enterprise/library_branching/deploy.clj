(ns metabase-enterprise.library-branching.deploy
  "The deploy: the head of the branch onto a consumption instance. A consumption instance shows only commits that its
  own validation accepted, in full: the deploy checks the head at the structural and the semantic level against the
  environment of the instance, and applies it in one transaction, or writes nothing. A removed item goes to the trash.
  A change on the instance that no commit holds (drift) stops the deploy, so that the deploy neither writes over it
  nor shows a mix of two commits."
  (:require
   [metabase-enterprise.library-branching.engine.plan :as plan]
   [metabase-enterprise.library-branching.engine.semantic :as semantic]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.pull :as pull]
   [metabase-enterprise.library-branching.settings :as settings]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase-enterprise.library-branching.store :as store]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn check-head
  "The full check of commit `h` of `store` against the environment `env` (`format.manifest/env`): `{:snapshot r}`, or
  `{:findings [f ...]}`, the structural findings of `pull/check-commit`, else the semantic findings of
  `semantic/validate`."
  [store codecs env h]
  (let [{r :snapshot :as checked} (pull/check-commit store codecs h)]
    (if-not r
      checked
      (let [findings (semantic/validate r env)]
        (if (seq findings)
          {:findings findings}
          {:snapshot r})))))

(defn- changed-ids
  "The keys of the maps `x` and `y` whose values differ, in the order of `snapshot/compare-identities`."
  [x y]
  (sort snapshot/compare-identities
        (filter #(not= (get x %) (get y %)) (distinct (concat (keys x) (keys y))))))

(defn- base-snapshot
  "The snapshot of base commit `b`, or nil when its tree cannot be read or does not decode."
  [store codecs b]
  (try
    (:snapshot (pull/decode-commit store codecs b))
    (catch Exception e
      (log/warnf e "Library branching cannot read the base commit %s; the base digests give the drift." b)
      nil)))

(defn drift
  "The drift of `l`, the synced snapshot of `inst`: the identities, in the order of `snapshot/compare-identities`, of
  the items whose content is not their content in base commit `b` (a create, an update or a delete since the base).
  With no base (`b` nil), the items of `l` whose content is not their content in `r`, the snapshot of the head. When
  the digests of `l` equal the base digests, `b` is not read. When the base commit cannot be read, the drift is the
  difference by digest, or every item of `l` with no base digests: it may only over-report."
  [inst store codecs b l r]
  (if (nil? b)
    (sort snapshot/compare-identities (filter (fn [id] (not= (get l id) (get r id))) (keys l)))
    (let [digests   (instance/base-digests inst b)
          by-digest (when digests (changed-ids digests (writer/item-digests codecs l)))]
      (if (and digests (empty? by-digest))
        []
        (if-let [bs (base-snapshot store codecs b)]
          (changed-ids bs l)
          (or by-digest (sort snapshot/compare-identities (keys l))))))))

(defn- apply-head!
  "Read, the drift check, plan and apply of head `h` with snapshot `r`, against base commit `b`, again after a stale
  precondition, at most `retries` times."
  [inst store branch {:keys [codecs retries fence on-commit]} b h r]
  (loop [attempt 0]
    (let [l   (:snapshot (instance/read-snapshot inst))
          ids (drift inst store codecs b l r)]
      (if (seq ids)
        {:result :drift :head h :ids (vec ids)}
        ;; With no drift, the base content is the local content, so every step's precondition is the local content.
        (let [steps    (plan/plan l r l)
              deployed (fn [{:keys [trashed-in-use]}]
                         {:result :deployed :head h :steps steps :trashed-in-use trashed-in-use})
              result   (instance/apply-plan! inst steps {:base      b
                                                         :new-base  h
                                                         :digests   (writer/item-digests codecs r)
                                                         :head-ok?  #(boolean
                                                                      (when-let [now (store/head store branch)]
                                                                        (store/ancestor? store h now)))
                                                         :fence     (or fence (constantly nil))
                                                         :on-commit (comp (or on-commit (constantly nil)) deployed)})]
          (cond
            (:ok result)
            (deployed (:ok result))

            (and (:stale result) (< attempt retries))
            (recur (inc attempt))

            (:stale result)     {:result :stale :head h :ids (:stale result)}
            (:fenced result)    {:result :fenced :head h :reason (:fenced result)}
            (:rewritten result) {:result :rewritten :head h}
            (:refused result)   {:result :refused :head h :refused (:refused result)}
            :else               {:result :base-moved :head h :base (:base-moved result)}))))))

(defn deploy!
  "Deploys the head of branch `branch` of `store` onto instance `inst`, a consumption instance whose environment is
  `env` (`format.manifest/env`). Returns one of:

  - `{:result :deployed :head h :steps plan :trashed-in-use m}`: the synced snapshot of the instance is the snapshot
    of `h`, and its base is `h`, with the digests of that snapshot; `m` is `{identity [user ...]}`, the items that
    the deploy moved to the trash and that content outside the Library uses;
  - `{:result :up-to-date :head h}`: the head is the base;
  - `{:result :invalid :head h :findings [f ...]}`: the head does not decode, breaks a structural rule, or names an
    environment object that `env` does not hold; the instance stays on its base;
  - `{:result :drift :head h :ids ids}`: the items `ids` of the instance have content that its base does not hold
    ([[drift]]);
  - `{:result :stale :head h :ids ids}`, `{:result :rewritten :head h}`, `{:result :refused :head h :refused [...]}`,
    `{:result :base-moved :head h :base actual}`, `{:result :fenced :head h :reason r}`: as for `pull/pull!`;
  - `{:result :no-branch}`: the branch does not exist;
  - `{:result :disabled}`: the setting `library-branching-enabled` is off.

  Every result other than `:deployed` writes nothing. `opts`: `:codecs` (default `kinds/codecs`), `:fence` (as in
  `apply/apply-plan`), `:on-commit` (a function of the `:deployed` result that the apply calls last in its
  transaction, so that its writes commit with the apply), `:retries` (default `pull/default-retries`)."
  ([inst store branch env]
   (deploy! inst store branch env {}))
  ([inst store branch env opts]
   (let [{:keys [codecs retries] :as opts} (merge {:codecs kinds/codecs :retries pull/default-retries} opts)]
     (if-not (settings/library-branching-enabled)
       {:result :disabled}
       (loop [rewrites 0]
         (let [b (instance/base inst)
               h (store/head store branch)]
           (cond
             (nil? h) {:result :no-branch}
             (= b h)  {:result :up-to-date :head h}
             :else
             (let [{r :snapshot :keys [findings]} (check-head store codecs env h)]
               (if-not r
                 {:result :invalid :head h :findings findings}
                 (let [result (apply-head! inst store branch opts b h r)]
                   (if (and (= :rewritten (:result result)) (< rewrites retries))
                     (recur (inc rewrites))
                     result)))))))))))
