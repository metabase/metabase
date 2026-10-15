(ns metabase-enterprise.library-branching.status
  "Status, change lists and the push preview of an instance and a branch. Read only: nothing here writes to the
  instance or to the repository.

  A change set is `{:created :deleted :updated}`, sets of identities, by content equality. The local changes are the
  difference of the content of the base and the synced snapshot of the instance; the remote changes are the difference
  of the content of the base and of the head of the branch."
  (:require
   [metabase-enterprise.library-branching.deploy :as deploy]
   [metabase-enterprise.library-branching.engine.diff :as diff]
   [metabase-enterprise.library-branching.engine.merge :as merge]
   [metabase-enterprise.library-branching.format.claims :as claims]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.tree :as tree]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.pull :as pull]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase-enterprise.library-branching.store :as store]))

(set! *warn-on-reflection* true)

(def no-changes
  "The change set with no change."
  {:created #{} :deleted #{} :updated #{}})

(defn changed?
  "True iff change set `changes` has a change."
  [changes]
  (boolean (some seq (vals changes))))

(defn- codecs-of [opts]
  (:codecs opts kinds/codecs))

(defn- decode
  "`claims/decode` of the tree `files` with the codecs and the option `:table-names` of `opts`."
  [opts files]
  (claims/decode (codecs-of opts) files (select-keys opts [:table-names])))

(defn- with-instance-names
  "`opts` with the options of `pull/decode-opts` of instance `inst`, unless `opts` has them."
  [opts inst]
  (merge (pull/decode-opts inst) opts))

(defn- fetched-tree
  "The tree of `commit` in `store` after a fetch of branch `branch`, or nil when `commit` is not in the local object
  store then: no branch of the remote holds it."
  [store branch commit]
  (store/head store branch)
  (when (pull/readable? store commit)
    (store/read-tree store commit)))

;;; -------------------------------------------------- Local changes --------------------------------------------------

(defn change-list
  "The entries of change set `changes`, in the order of `snapshot/compare-identities`: `{:id :kind :name :change}`,
  where `:change` is `:created`, `:updated` or `:deleted`. The kind and the name come from the local snapshot `local`,
  and for a deleted item from the base snapshot `base`; they are nil for a deleted item that `base` (nil: unknown) does
  not hold."
  [changes local base]
  (->> (for [change [:created :updated :deleted]
             id     (get changes change)
             :let   [item (get (if (= :deleted change) base local) id)]]
         {:id id :kind (:kind item) :name (:name item) :change change})
       (sort-by :id snapshot/compare-identities)
       vec))

(defn base-snapshot
  "The snapshot of base commit `b`, read through `store` after a fetch of branch `branch`, or nil when the repository no
  longer holds `b` or its tree does not decode. `opts`: `:codecs`, `:table-names` (as `claims/decode`)."
  [store branch b opts]
  (some->> (fetched-tree store branch b)
           (decode opts)
           :snapshot))

(defn local-changes
  "The local changes of instance `inst`: `{:base b :local l :changes c :shadowed-tables ts}`, where `b` is the base, `l`
  the synced snapshot, `c` the change set from the content of `b` to `l`, by digest (with no base, every item of `l`
  is created), and `ts` the `:shadowed-tables` of the read of `l` (`instance/read-snapshot`), empty when it has none.
  `(with-store f)` calls `f` with a store of the repository, on branch `branch`; it is called only when the instance
  stored no digests with its base. Throws ex-info with `:status-code` 400 when the content of the base is not known.
  The base decodes with `pull/decode-opts` of `inst`. `opts`: `:codecs` (default `kinds/codecs`)."
  [inst with-store branch opts]
  (let [opts    (with-instance-names opts inst)
        codecs  (codecs-of opts)
        b       (instance/base inst)
        {l :snapshot shadowed :shadowed-tables} (instance/read-snapshot inst)
        digests (if b
                  (or (instance/base-digests inst b)
                      (with-store (fn [s]
                                    (some->> (base-snapshot s branch b opts) (writer/item-digests codecs)))))
                  {})]
    (when-not digests
      (throw (ex-info (format "The content of the base commit %s is not known: no branch of the repository holds it." b)
                      {:status-code 400 :base b})))
    {:base            b
     :local           l
     :changes         (diff/diff digests (writer/item-digests codecs l))
     :shadowed-tables (vec shadowed)}))

;;; -------------------------------------------------- Remote changes -------------------------------------------------

(defn full-remote-changes
  "The remote changes from base commit `b` to head `h` of `store`, from a decode of every item file of `h`: `{:changes
  c}`, `{:findings f}` when the tree of `h` does not decode, or `{:unknown :base}` when the content of `b` is not known.
  The content of `b` is `(:base-digests opts)` when given, else the decode of the tree of `b`; `b` nil has no items.
  `opts`: `:codecs`, `:base-digests`, `:table-names` (as `claims/decode`)."
  [store b h opts]
  (let [codecs (codecs-of opts)
        {r :snapshot :keys [findings]} (decode opts (store/read-tree store h))]
    (if-not r
      {:findings findings}
      (let [base (cond
                   (nil? b)              {}
                   (:base-digests opts)  (:base-digests opts)
                   (pull/readable? store b)   (some->> (decode opts (store/read-tree store b))
                                                       :snapshot
                                                       (writer/item-digests codecs)))]
        (if base
          {:changes (diff/diff base (writer/item-digests codecs r))}
          {:unknown :base})))))

(def ^:private system-related
  "The identities whose presence in a tree can change what `claims/decode` adds to its snapshot: the system items that
  it completes, and their places."
  (into (set (keys claims/system-items)) (keep :place) (vals claims/system-items)))

(defn- read-doc
  "The document of the bytes `b`, or nil when they are not one YAML document of the document model: a foreign file."
  [b]
  (try
    (codec/read-yaml b)
    (catch clojure.lang.ExceptionInfo e
      (when-not (= ::codec/unreadable (:type (ex-data e)))
        (throw e)))))

(defn- changed-items
  "`{identity item}` of the item files of tree `t` at `paths`, or ::full when a file there is a format file, an
  old-format item file or an item file that does not decode, or when two of them hold one identity."
  [by-name t paths]
  (reduce (fn [acc p]
            (if-let [b (get t p)]
              (case (claims/claim (read-doc b))
                (nil :manifest) acc
                :item           (let [[id item] (:item (tree/decode-file by-name b))]
                                  (if (or (nil? id) (contains? acc id))
                                    (reduced ::full)
                                    (assoc acc id item)))
                (reduced ::full))
              acc))
          {}
          paths))

(defn- fast-remote-changes
  "The remote changes from `b` to `h` from the files that `store/changed-paths` names, or ::full when that is not
  exact. `base-ids` is the set of identities of the content of `b`."
  [store codecs b h base-ids]
  (let [{:keys [added modified deleted]} (store/changed-paths store b h)
        by-name (update-keys (codec/by-kind codecs) name)
        at-b    (changed-items by-name (store/read-tree store b) (concat modified deleted))
        at-h    (changed-items by-name (store/read-tree store h) (concat added modified))]
    (cond
      (or (= ::full at-b) (= ::full at-h))
      ::full

      (some system-related (concat (keys at-b) (keys at-h)))
      ::full

      ;; an item of the base in a file that did not change stays in the head: a second file holds its identity
      (some (fn [id] (and (not (contains? at-b id)) (contains? base-ids id))) (keys at-h))
      ::full

      :else
      {:changes (diff/diff at-b at-h)})))

(defn remote-changes
  "The remote changes from base commit `b` to head `h` of `store`, as [[full-remote-changes]], which gives the same
  result. When `h` is `b`, no change, with no read of the store. Else it decodes only the files that
  `store/changed-paths` names, at both commits, when that is exact: every changed file is a foreign file or an item file
  that decodes, no changed file holds a system item or the Library, and no new file holds an item of the base
  (`(:base-digests opts)`, required for this path). `opts`: `:codecs`, `:base-digests`, `:table-names`."
  [store b h opts]
  (let [codecs  (codecs-of opts)
        digests (:base-digests opts)
        fast    (when (and b digests (not= b h) (pull/readable? store b))
                  (fast-remote-changes store codecs b h (set (keys digests))))]
    (cond
      (= b h)                {:changes no-changes}
      (and fast (map? fast)) fast
      :else                  (full-remote-changes store b h opts))))

;;; ------------------------------------------------------ Status -----------------------------------------------------

(defn- base-digests-of
  "The digests that `inst` stored with its base `b`, or nil."
  [inst b]
  (when b
    (instance/base-digests inst b)))

(defn status
  "The status of instance `inst` and branch `branch` of `store`:

    {:base b :head h :branch-missing m :base-lost l :head-findings f :local lc :remote rc :shadowed-tables ts}

  `h` is nil and `m` true when the branch does not exist. `l` is true iff there is a base and no branch holds it; then
  nothing shows as synced. `f` is nil, or the findings of the head (it does not decode, or breaks a structural
  rule). `lc` is the change set of [[local-changes]]; `rc` the remote changes, nil when the head has
  findings, does not exist, or the content of the base is not known. `ts` holds the published tables that scope
  leaves out because another published table owns their key, as [[local-changes]] gives them. Each commit decodes
  with `pull/decode-opts` of `inst`. `opts`: `:codecs`, `:consumption?`: `inst` is a consumption instance. Then the
  status also has `:drift`, the identities of `deploy/drift`: the changes on the instance that stop a deploy of the
  head, in the order of the identities."
  [inst store branch opts]
  (let [opts     (with-instance-names opts inst)
        codecs   (codecs-of opts)
        h        (store/head store branch)
        {b :base l :local local :changes shadowed :shadowed-tables} (local-changes inst (fn [f] (f store)) branch opts)
        checked  (when h (pull/check-commit store codecs h (select-keys opts [:table-names])))
        findings (:findings checked)
        remote   (when (:snapshot checked)
                   (:changes (remote-changes store b h (assoc opts :base-digests (base-digests-of inst b)))))]
    (cond-> {:base           b
             :head           h
             :branch-missing (nil? h)
             :base-lost      (boolean (and b (not (pull/held? store b branch h))))
             :head-findings  findings
             :local           local
             :remote          remote
             :shadowed-tables shadowed}
      (:consumption? opts) (assoc :drift (vec (deploy/drift inst store codecs b l (:snapshot checked)))))))

;;; --------------------------------------------------- Push preview --------------------------------------------------

(def ^:private no-summary
  {:added 0 :updated 0 :removed 0})

(defn- summary
  "The numbers of items that a merge of `l` and `r` from base `b` takes from `r` over an unchanged item of `l`."
  [b l r]
  (reduce (fn [acc id]
            (let [bi (get b id), li (get l id), ri (get r id)]
              (if (and (= li bi) (not= ri bi))
                (update acc (cond (nil? li) :added (nil? ri) :removed :else :updated) inc)
                acc)))
          no-summary
          (distinct (concat (keys l) (keys r)))))

(defn conflict-entry
  "The entry of conflict `{:id :base :ours :theirs}` of `merge/merge`: `{:id :kind :name :ours :theirs}`. The kind
  and the name are of the local content, else of the remote content, else of the base. `:ours` and `:theirs` are the
  changes of the two sides against the base (`merge/side-change`)."
  [{:keys [id base ours theirs]}]
  (let [item (some #(when (map? %) %) [ours theirs base])]
    {:id     id
     :kind   (:kind item)
     :name   (:name item)
     :ours   (merge/side-change base ours)
     :theirs (merge/side-change base theirs)}))

(defn violation-entry
  "The entry of violation `v` of `merge/merge`: `{:rule :ours :theirs}`."
  [v]
  (select-keys v [:rule :ours :theirs]))

(defn- lost-base
  "A base in which each item of `l` and `r` is unknown, so that every difference of the two sides is a conflict."
  [l r]
  (zipmap (distinct (concat (keys l) (keys r))) (repeat :unknown)))

(defn push-preview
  "What a push of instance `inst` to branch `branch` of `store` meets: the status, plus a merge of the base, the synced
  snapshot and the head, with no keep-mine decision. Pure apart from the reads.

    {:head h :diverged d :clean c :conflicts [...] :violations [...] :summary s :branch-missing m :base-lost l
     :head-findings f}

  `h` is the head that the merge reads, nil when the branch does not exist: a keep-mine decision names it. `d` is true
  iff the head is not the base. With `d` false, no conflict, and no read of the instance. A conflict is
  [[conflict-entry]]; a violation is [[violation-entry]]. `s` is `{:added :updated :removed}`: the numbers of
  items that the merge takes from the head over an unchanged local item. A base that no branch holds is lost: every
  difference of the two sides is a conflict. A head with findings is not clean, and has no merge. Each commit decodes
  with `pull/decode-opts` of `inst`. `opts`: `:codecs`."
  [inst store branch opts]
  (let [opts   (with-instance-names opts inst)
        codecs (codecs-of opts)
        b      (instance/base inst)
        h      (store/head store branch)
        lost?  (boolean (and b (not (pull/held? store b branch h))))
        result {:head           h
                :diverged       (not= b h)
                :clean          true
                :conflicts      []
                :violations     []
                :summary        no-summary
                :branch-missing (nil? h)
                :base-lost      lost?
                :head-findings  nil}]
    (if (or (= b h) (nil? h))
      result
      (let [{r :snapshot :keys [findings]} (pull/check-commit store codecs h (select-keys opts [:table-names]))]
        (if-not r
          (assoc result :clean false :head-findings findings)
          (let [l      (:snapshot (instance/read-snapshot inst))
                base   (cond
                         (nil? b) {}
                         lost?    nil
                         :else    (:snapshot (decode opts (store/read-tree store b))))
                base   (or base (lost-base l r))
                merged (merge/merge base l r {})]
            (assoc result
                   :clean      (contains? merged :ok)
                   :conflicts  (mapv conflict-entry (:conflicts merged))
                   :violations (mapv violation-entry (:violations merged))
                   :summary    (summary base l r))))))))

;;; ------------------------------------------------- Has remote changes ----------------------------------------------

(defn check-remote-changes
  "Whether branch `branch` of `store` has remote changes for instance `inst`, with no cache:

    {:has-changes c :remote-version h :local-version b :branch-missing m}

  `c` is true iff the [[remote-changes]] from the base `b` to the head `h` are not empty, or are not known (the head does
  not decode, or the content of the base is not known). A branch that does not exist gives `c` false and `m` true.
  Each commit decodes with `pull/decode-opts` of `inst`. `opts`: `:codecs`."
  [inst store branch opts]
  (let [opts (with-instance-names opts inst)
        b    (instance/base inst)
        h (store/head store branch)]
    {:has-changes    (boolean
                      (and h
                           (not= b h)
                           (let [{:keys [changes]} (remote-changes store b h
                                                                   (assoc opts :base-digests (base-digests-of inst b)))]
                             (or (nil? changes) (changed? changes)))))
     :remote-version h
     :local-version  b
     :branch-missing (nil? h)}))

(defn cached-answer
  "The answer of cache entry `entry` (`{:key k :at t :answer a}`, or nil) for key `key` at time `now-ms`, or nil when the
  entry is for another key or older than `ttl-ms`. Pure."
  [entry key now-ms ttl-ms]
  (when (and entry (= key (:key entry)) (< (- now-ms (:at entry)) ttl-ms))
    (:answer entry)))

(defonce ^:private remote-changes-cache
  (atom nil))

(defn has-remote-changes!
  "[[check-remote-changes]] of instance `inst` and the store of `(with-store f)`, with `:cached` false, or the answer
  that it gave less than `:ttl-seconds` ago with `:cached` true. The cache holds one answer, for the key of the
  repository URL `:url`, the branch `:branch` and the base of `inst`: a change of the URL or the branch, and a push or
  a pull that moves the base, miss it. `:force-refresh?` misses it. An answer for a branch that does not exist is not
  cached. A failure of the store throws, and is not cached. `opts`: `:url`, `:branch`, `:ttl-seconds`,
  `:force-refresh?`, `:now-ms` (default the clock), `:codecs`."
  [inst with-store {:keys [url branch ttl-seconds force-refresh? now-ms] :as opts}]
  (let [now    (or now-ms (System/currentTimeMillis))
        key    [url branch (instance/base inst)]
        cached (when-not force-refresh?
                 (cached-answer @remote-changes-cache key now (* 1000 ttl-seconds)))]
    (if cached
      (assoc cached :cached true)
      (let [answer (with-store #(check-remote-changes inst % branch opts))]
        (when-not (:branch-missing answer)
          (reset! remote-changes-cache {:key key :at now :answer answer}))
        (assoc answer :cached false)))))
