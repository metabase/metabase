(ns metabase-enterprise.library-branching.push
  "The push: the synced snapshot of an instance as a new commit on its branch, whose parent is the base. A push writes
  every local change. It moves the branch only from the base, and it records as the new base content exactly the
  snapshot that it wrote."
  (:require
   [metabase-enterprise.library-branching.engine.validate :as validate]
   [metabase-enterprise.library-branching.format.claims :as claims]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.roots :as roots]
   [metabase-enterprise.library-branching.settings :as settings]
   [metabase-enterprise.library-branching.store :as store]))

(set! *warn-on-reflection* true)

(def default-message
  "The commit message of a push that names none."
  "Library branching push")

(def remote-moved-message
  "The error message of a push task whose remote compare-and-swap refused."
  "The branch moved during the push. Pull, then push again.")

(defn foreign-files
  "The files of tree `t`, `{path bytes}`, that a push keeps at their paths: `claims/kept-files`."
  [t]
  (claims/kept-files (claims/item-claims t)))

(defn tree-digests
  "The item digests of the snapshot that tree `t` holds (`claims/decode`), with the codecs `codecs`, or nil when it
  does not decode (a tree in the old format, for example)."
  [codecs t]
  (some->> (claims/decode codecs t)
           :snapshot
           (writer/item-digests codecs)))

(defn- base-digests
  "The item digests of the content of base `b`: the digests that the instance stored with it, else those of its tree.
  nil when neither is known; `{}` when there is no base."
  [inst codecs base-tree b]
  (if b
    (or (instance/base-digests inst b) (tree-digests codecs @base-tree))
    {}))

(defn- commit!
  "Writes the commit of snapshot `s` on base `b`, moves `branch` to it from `b`, then moves the base to it with the
  digests of `s`."
  [inst store codecs branch message b base-tree s digests]
  ;; Foreign files of the base stay at their paths. An item file is written again from `s`, so it leaves the tree
  ;; when its item left `s`, and it moves to its canonical path when someone moved it.
  (let [files (merge (foreign-files @base-tree) (writer/encode-tree codecs s))
        c     (store/write-commit store (if b [b] []) files message)
        moved (store/cas-ref! store branch b c)]
    (if (not= :ok moved)
      {:result :remote-moved :base b :head (:moved moved)}
      ;; The digests are those of the snapshot that the commit holds, never of a later read: a save after the read
      ;; point stays a local change against `c`.
      (let [set-base (instance/set-base! inst b c digests)]
        (if (= :ok set-base)
          {:result :pushed :commit c}
          {:result :base-moved :commit c :base (:moved set-base)})))))

(defn push!
  "Pushes the synced snapshot of instance `inst` to branch `branch` of `store`. Returns one of:

  - `{:result :pushed :commit c}`: `c` holds the snapshot that the push read, its parent is the old base, the
    branch is at `c`, and the base is `c`;
  - `{:result :nothing-to-push :commit b}`: the snapshot equals the content of the base `b`;
  - `{:result :remote-moved :base b :head h}`: the branch is not at the base, so the caller pulls first;
  - `{:result :invalid :findings [f ...]}`: the snapshot breaks a structural rule (`validate/validate`, with the
    fixed roots of `roots/root-ids`), for example a Library item that refers to a trashed item;
  - `{:result :base-moved :commit c :base actual}`: the branch is at `c`, and something else moved the base;
  - `{:result :disabled}`: the setting `library-branching-enabled` is off.

  Only `:pushed` and `:base-moved` change the branch, and only `:pushed` changes the base. A first push to a tree in
  the old format writes the new layout and the format version file in one commit. The [[foreign-files]] of the base
  tree stay. `opts`: `:codecs` (default `kinds/codecs`), `:message` (default [[default-message]])."
  ([inst store branch task]
   (push! inst store branch task {}))
  ([inst store branch _task {:keys [codecs message] :or {codecs kinds/codecs message default-message}}]
   (if-not (settings/library-branching-enabled)
     {:result :disabled}
     (let [b (instance/base inst)
           h (store/head store branch)]
       (if (not= b h)
         {:result :remote-moved :base b :head h}
         (let [s         (:snapshot (instance/read-snapshot inst))
               digests   (writer/item-digests codecs s)
               base-tree (delay (some->> b (store/read-tree store)))]
           (if (= digests (base-digests inst codecs base-tree b))
             {:result :nothing-to-push :commit b}
             (let [findings (validate/validate s {:roots (roots/root-ids s)})]
               (if (seq findings)
                 {:result :invalid :findings findings}
                 (commit! inst store codecs branch message b base-tree s digests))))))))))
