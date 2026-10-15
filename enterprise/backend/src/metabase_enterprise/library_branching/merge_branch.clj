(ns metabase-enterprise.library-branching.merge-branch
  "Merge-branch: a merge of one branch into another in git, by the merge rules of the snapshot, with no instance. It is
  \"bring the newest main into my branch\"."
  (:require
   [metabase-enterprise.library-branching.engine.merge :as merge]
   [metabase-enterprise.library-branching.engine.validate :as validate]
   [metabase-enterprise.library-branching.format.claims :as claims]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.pull :as pull]
   [metabase-enterprise.library-branching.push :as push]
   [metabase-enterprise.library-branching.roots :as roots]
   [metabase-enterprise.library-branching.settings :as settings]
   [metabase-enterprise.library-branching.store :as store]))

(set! *warn-on-reflection* true)

(def default-message
  "The commit message of a merge-branch that names none."
  "Library branching merge")

(defn- foreign
  [t]
  (claims/kept-files (claims/item-claims t)))

(defn merge-foreign
  "The three-way merge by path of the files that sync does not write (`claims/kept-files`) of the trees `a` (the merge
  base), `o` and `t`, `{path bytes}`:
  `{:ok files}`, or `{:conflicts [path ...]}` for each path that both sides changed in different ways. A deleted file
  is no content."
  [a o t]
  (let [[a o t] (map foreign [a o t])
        same?   (fn [x y] (or (and (nil? x) (nil? y))
                              (and x y (java.util.Arrays/equals ^bytes x ^bytes y))))
        results (for [p (sort (distinct (concat (keys a) (keys o) (keys t))))
                      :let [fa (get a p), fo (get o p), ft (get t p)]]
                  [p (cond
                       (same? fo ft) fo
                       (same? fo fa) ft
                       (same? ft fa) fo
                       :else         ::conflict)])
        conflicts (into [] (keep (fn [[p r]] (when (= ::conflict r) p))) results)]
    (if (seq conflicts)
      {:conflicts conflicts}
      {:ok (into {} (filter second) results)})))

(defn merge-branch!
  "Merges branch `from` into branch `into` of `store`. Returns one of:

  - `{:result :merged :commit c}`: `c` is a commit with the parents `[head(into) head(from)]` whose item files are
    the encoding of the merge of the two snapshots from their merge base, and `into` is at `c`;
  - `{:result :up-to-date :head h}`: the head of `from` is in the history of `into`;
  - `{:result :conflicts :conflicts [...] :violations [...] :foreign [path ...]}`: the merge of `merge/merge`, or of
    the foreign files by path, failed;
  - `{:result :invalid :commit c :findings [f ...]}`: commit `c` (a head or the merge base) does not decode; or, with
    `c` nil, the merge result breaks a structural rule (with the fixed roots of `roots/root-ids`), or the merge commit
    would overwrite a merged foreign file (`push/foreign-clashes`);
  - `{:result :no-branch :ref r}`, `{:result :no-merge-base}`;
  - `{:result :remote-moved :head actual}`: `into` moved during the merge; nothing changed;
  - `{:result :disabled}`: the setting `library-branching-enabled` is off.

  Only `:merged` moves a ref. The merged foreign files stay at their paths; an item whose path one of them holds gets
  its identity as a suffix (`layout/layout`). `opts`: `:codecs` (default `kinds/codecs`), `:message` (default
  [[default-message]]), `:table-names` and `:card-ids` (as `claims/decode`; see `pull/decode-opts`), `:on-phase` (a
  function of a key of `tasks/phase-starts`, called at the start of the read, the plan, the apply (the write of the
  commit) and the commit (the move of `into`); a throw of it stops the merge, and no ref moves; default: none)."
  ([store into from]
   (merge-branch! store into from {}))
  ([store into from {:keys [codecs message on-phase]
                     :or   {codecs kinds/codecs message default-message on-phase (constantly nil)}
                     :as   opts}]
   (on-phase :read)
   (if-not (settings/library-branching-enabled)
     {:result :disabled}
     (let [c1 (store/head store into)
           c2 (store/head store from)
           a  (when (and c1 c2) (store/merge-base store c1 c2))]
       (cond
         (nil? c1)                    {:result :no-branch :ref into}
         (nil? c2)                    {:result :no-branch :ref from}
         (store/ancestor? store c2 c1) {:result :up-to-date :head c1}
         (nil? a)                     {:result :no-merge-base}
         :else
         (let [decoded (map (fn [c] [c (pull/decode-commit store codecs c (select-keys opts pull/decode-keys))]) [a c1 c2])]
           (if-let [[c {:keys [findings]}] (first (filter (comp :findings second) decoded))]
             {:result :invalid :commit c :findings findings}
             (let [[sa s1 s2] (map (comp :snapshot second) decoded)
                   _          (on-phase :plan)
                   merged     (merge/merge sa s1 s2 {})
                   files      (merge-foreign (store/read-tree store a) (store/read-tree store c1) (store/read-tree store c2))]
               (cond
                 (or (not (:ok merged)) (:conflicts files))
                 (merge {:result :conflicts :conflicts [] :violations [] :foreign []}
                        (dissoc merged :ok)
                        (when-let [ps (:conflicts files)] {:foreign ps}))

                 :else
                 (let [m        (:ok merged)
                       findings (validate/validate m {:roots (roots/root-ids m)})]
                   (if (seq findings)
                     {:result :invalid :commit nil :findings findings}
                     (let [kept    (:ok files)
                           written (writer/encode-tree codecs m (set (keys kept)))
                           clashes (push/foreign-clashes kept written)]
                       (if (seq clashes)
                         {:result :invalid :commit nil :findings clashes}
                         (let [_     (on-phase :apply)
                               c     (store/write-commit store [c1 c2] (merge kept written) message)
                               _     (on-phase :commit)
                               moved (store/cas-ref! store into c1 c)]
                           (if (= :ok moved)
                             {:result :merged :commit c}
                             {:result :remote-moved :head (:moved moved)})))))))))))))))
