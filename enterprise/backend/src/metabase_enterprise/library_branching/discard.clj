(ns metabase-enterprise.library-branching.discard
  "The discard of the local changes of a creation instance: the admin's choice to write the content of the base over
  every local change, for example before a switch to another branch. The base does not move, and the repository does
  not change."
  (:require
   [metabase-enterprise.library-branching.engine.plan :as plan]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.pull :as pull]
   [metabase-enterprise.library-branching.settings :as settings]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase-enterprise.library-branching.store :as store]))

(set! *warn-on-reflection* true)

(defn- changed-ids
  "The identities of the items whose content differs between the snapshots `x` and `y`, in the order of
  `snapshot/compare-identities`."
  [x y]
  (sort snapshot/compare-identities
        (filter #(not= (get x %) (get y %)) (distinct (concat (keys x) (keys y))))))

(defn- apply-base!
  "Read, plan and apply of the base snapshot `bs` of base commit `b` over the local changes, again after a stale
  precondition, at most `retries` times."
  [inst store branch {:keys [codecs retries fence]} b bs]
  (loop [attempt 0]
    (let [l   (:snapshot (instance/read-snapshot inst))
          ids (changed-ids bs l)]
      (if (empty? ids)
        {:result :up-to-date :base b}
        ;; The precondition of each step is the local content: the admin chose to write over it.
        (let [steps  (plan/plan l bs l)
              result (instance/apply-plan! inst steps {:base     b
                                                       :new-base b
                                                       :digests  (writer/item-digests codecs bs)
                                                       ;; read last in the transaction: the base must still be held
                                                       :head-ok? (fn []
                                                                   (pull/held? store b branch (store/head store branch)))
                                                       :fence    (or fence (constantly nil))})]
          (cond
            (:ok result)
            (let [{:keys [trashed-in-use renamed]} (:ok result)]
              (cond-> {:result         :discarded
                       :base           b
                       :steps          steps
                       :discarded      (vec ids)
                       :trashed-in-use trashed-in-use}
                renamed (assoc :renamed renamed)))

            (and (:stale result) (< attempt retries))
            (recur (inc attempt))

            (:stale result)     {:result :stale :base b :ids (:stale result)}
            (:fenced result)    {:result :fenced :base b :reason (:fenced result)}
            (:rewritten result) {:result :base-lost :base b}
            (:refused result)   {:result :refused :base b :refused (:refused result)}
            :else               {:result :base-moved :base b :actual (:base-moved result)}))))))

(defn discard!
  "Writes the content of the base commit over the local changes of instance `inst`, in one transaction: afterwards the
  synced snapshot of `inst` is the snapshot of its base, and the base stays. `store` and `branch` give the branch that
  must still hold the base. Returns one of:

  - `{:result :discarded :base b :steps plan :discarded ids :trashed-in-use m :renamed r}`: `ids` are the items whose
    local change it wrote over, in the order of the identities; `m` is `{identity [user ...]}`, the items that it
    moved to the trash and that content outside the Library uses; `r` is `{identity name}`, the items that it moved to
    the trash with a new name, so that the base could take their keys, and is absent when there is none;
  - `{:result :up-to-date :base b}`: the instance has no local change;
  - `{:result :no-base}`: the instance has no base, so there is nothing to go back to;
  - `{:result :base-lost :base b}`: no branch of the repository holds the base (also when that became so during the
    apply);
  - `{:result :invalid :base b :findings [f ...]}`: the base does not decode, or breaks a structural rule;
  - `{:result :stale :base b :ids ids}`, `{:result :refused :base b :refused [...]}`, `{:result :base-moved :base b
    :actual a}`, `{:result :fenced :base b :reason r}`: as for `pull/pull!`;
  - `{:result :disabled}`: the setting `library-branching-enabled` is off.

  Every result other than `:discarded` writes nothing. The base decodes with `pull/decode-opts` of `inst`. `opts`:
  `:codecs` (default `kinds/codecs`), `:fence` (as in `apply/apply-plan`), `:retries` (default
  `pull/default-retries`)."
  ([inst store branch]
   (discard! inst store branch {}))
  ([inst store branch opts]
   (let [{:keys [codecs] :as opts} (merge {:codecs kinds/codecs :retries pull/default-retries} opts)
         b                         (when (settings/library-branching-enabled) (instance/base inst))]
     (cond
       (not (settings/library-branching-enabled)) {:result :disabled}
       (nil? b)                                   {:result :no-base}
       (not (pull/held? store b branch (store/head store branch))) {:result :base-lost :base b}
       :else
       (let [{bs :snapshot :keys [findings]} (pull/check-commit store codecs b (pull/decode-opts inst))]
         (if-not bs
           {:result :invalid :base b :findings findings}
           (apply-base! inst store branch opts b bs)))))))
