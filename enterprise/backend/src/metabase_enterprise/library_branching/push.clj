(ns metabase-enterprise.library-branching.push
  "The push: the synced snapshot of an instance as a new commit on its branch, whose parent is the base. A push writes
  every local change, and keeps every file of the base tree that sync does not write. It runs as a task with a commit
  point: it moves the branch only from the base, only while its task is running, and it records as the new base
  content exactly the snapshot that it wrote."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.library-branching.engine.validate :as validate]
   [metabase-enterprise.library-branching.format.claims :as claims]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.pull :as pull]
   [metabase-enterprise.library-branching.roots :as roots]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase-enterprise.library-branching.settings :as settings]
   [metabase-enterprise.library-branching.store :as store]
   [metabase-enterprise.library-branching.tasks :as tasks]))

(set! *warn-on-reflection* true)

(def default-message
  "The commit message of a push that names none."
  "Library branching push")

(defn remote-moved-message
  "The error message of a push to branch `branch` that the remote refused, because the branch moved."
  [branch]
  (format "The branch %s moved since the last sync, so nothing was pushed. Pull first." branch))

(defn branch-exists-message
  "The error message of a push to a new branch `branch` that the remote refused, because the branch exists."
  [branch]
  (format "The repository already has a branch %s, so nothing was pushed." branch))

(defn outcome
  "The outcome of the task of a push that landed commit `commit` on branch `branch`, with `:warnings`, the message of
  each table of `shadowed` (`scope/shadowed-tables`), when there is one."
  ([branch commit]
   (outcome branch commit nil))
  ([branch commit shadowed]
   (cond-> {:kind "pushed" :branch branch :commit commit}
     (seq shadowed) (assoc :warnings (mapv scope/shadowed-message shadowed)))))

(defn foreign-files
  "The files of tree `t`, `{path bytes}`, that a push keeps at their paths: `claims/kept-files`."
  [t]
  (claims/kept-files (claims/item-claims t)))

(defn tree-digests
  "The item digests of the snapshot that tree `t` holds (`claims/decode`), with the codecs `codecs`, or nil when it
  does not decode (a tree with a file of a kind that has no codec, for example)."
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

(defn- dirs-of
  "The directories of path `p`: each proper prefix that ends before a /."
  [^String p]
  (let [segments (str/split p #"/")]
    (map #(str/join "/" (take % segments)) (range 1 (count segments)))))

(defn foreign-clashes
  "`{:rule :foreign-path :path p :foreign q}` for each path `p` of `written` (`{path bytes}`) that would overwrite or
  hide the file at path `q` of `kept`: `p` is `q`, `q` is a directory of `p`, or `p` is a directory of `q`. In the
  order of the paths."
  [kept written]
  (let [kept-paths (set (keys kept))
        kept-dirs  (into {} (for [q kept-paths, d (dirs-of q)] [d q]))]
    (vec (for [p     (sort (keys written))
               :let  [q (or (kept-paths p)
                            (some kept-paths (dirs-of p))
                            (get kept-dirs p))]
               :when q]
           {:rule :foreign-path :path p :foreign q}))))

(defn- tree
  "The files of the commit of snapshot `s` on the base tree `base-files` (nil: no base): the files of the base tree
  that sync does not write, at their paths, and the encoding of `s`, whose paths avoid them. `{:files f}`, or
  `{:findings [f ...]}` of [[foreign-clashes]] when an item file or the format version file would still overwrite a
  kept file."
  [codecs base-files s]
  (let [kept     (foreign-files base-files)
        written  (writer/encode-tree codecs s (set (keys kept)))
        findings (foreign-clashes kept written)]
    (if (seq findings)
      {:findings findings}
      {:files (merge kept written)})))

(defn- commit!
  "Writes commit `files` with `parents`, then, as task `task`: passes the commit point, moves `branch` to the commit
  (from base `b`, or from no ref when `new-branch?`), and in the record step moves the base from `b` to it with the
  digests of the pushed snapshot, calls `on-record` when the base moved, and ends the task with the [[outcome]] of
  `shadowed`."
  [inst store task branch message b parents new-branch? files digests on-record shadowed]
  (let [c      (store/write-commit store parents files message)
        marked (tasks/mark-committing! task)]
    (if (not= :ok marked)
      {:result :fenced :status (:fenced marked)}
      (let [moved (store/cas-ref! store branch (when-not new-branch? b) c)]
        (cond
          (= :ok moved)
          ;; The digests are those of the snapshot that the commit holds, never of a later read: a save after the read
          ;; point stays a local change against `c`. The base moves only from `b`, the base that the push read: a
          ;; paused push that wakes up after another task moved the base keeps that base.
          (let [record (fn []
                         (let [set-base (instance/set-base! inst b c digests)]
                           (if (= :ok set-base)
                             (do (on-record)
                                 {:result :pushed :commit c :outcome (outcome branch c shadowed)})
                             {:result :base-moved :commit c :base (:moved set-base)
                              :outcome (outcome branch c shadowed)})))]
            (dissoc (tasks/record! task record) :outcome))

          new-branch?
          (do (tasks/fail-committing! task (branch-exists-message branch))
              {:result :branch-exists :head (:moved moved)})

          :else
          (do (tasks/fail-committing! task (remote-moved-message branch))
              {:result :remote-moved :base b :head (:moved moved)}))))))

(defn push!
  "Pushes the synced snapshot of instance `inst` to branch `branch` of `store`, as the work of task `task` (the id of a
  running push task, `tasks/start!`). Returns one of:

  - `{:result :pushed :commit c}`: `c` holds the snapshot that the push read, its parent is the old base, the
    branch is at `c`, and the base is `c`;
  - `{:result :nothing-to-push :commit b}`: the snapshot equals the content of the base `b`;
  - `{:result :remote-moved :base b :head h}`: the branch is not at the base, so the caller pulls first;
  - `{:result :branch-exists :head h}`: a push to a new branch, and the branch exists at `h`;
  - `{:result :invalid :findings [f ...]}`: the snapshot breaks a structural rule (`validate/validate`, with the
    fixed roots of `roots/root-ids`), for example a Library item that refers to an item in the trash or outside the
    Library; or the commit would overwrite a file that sync does not write ([[foreign-clashes]]);
  - `{:result :fenced :status s}`: the task was not running at the commit point (status `s`: an admin cancelled it,
    or a reader superseded it);
  - `{:result :base-moved :commit c :base actual}`: the branch is at `c`, and another task moved the base;
  - `{:result :disabled}`: the setting `library-branching-enabled` is off.

  A result after the read of the snapshot also has `:shadowed-tables`, the published tables that scope leaves out
  because another published table owns their key (`scope/shadowed-tables`), when there is one. Only `:pushed` and
  `:base-moved` change the branch, and only `:pushed` changes the base. A push past its commit
  point ends its task: as successful with the outcome of [[outcome]] (`:pushed`, `:base-moved`), or as failed with
  [[remote-moved-message]] (a `:remote-moved` after the commit point) or [[branch-exists-message]] (a
  `:branch-exists` after the commit point). Every other result leaves the task running, for the caller to end. A
  first push to a tree in the old format writes the new layout and the format version file in one commit. The
  [[foreign-files]] of the base tree stay at their paths; an item whose path one of them holds gets its identity as a
  suffix (`layout/layout`). `opts`:

  - `:codecs` (default `kinds/codecs`), `:message` (default [[default-message]]);
  - `:new-branch?`: push to a new branch: `branch` must not exist, and the push creates it at a commit whose parent
    is the base, also when the snapshot equals the content of the base; the branch of the base does not move;
  - `:on-record`: a function of no argument that the record step calls when the base moved, so that its writes
    commit with the move of the base and the end of the task (default: none)."
  ([inst store branch task]
   (push! inst store branch task {}))
  ([inst store branch task {:keys [codecs message new-branch? on-record]
                            :or   {codecs kinds/codecs message default-message on-record (constantly nil)}}]
   (if-not (settings/library-branching-enabled)
     {:result :disabled}
     (let [b (instance/base inst)
           h (store/head store branch)]
       (cond
         (and new-branch? h)                {:result :branch-exists :head h}
         (and (not new-branch?) (not= b h)) {:result :remote-moved :base b :head h}
         :else
         (let [{s :snapshot shadowed :shadowed-tables} (instance/read-snapshot inst)
               digests   (writer/item-digests codecs s)
               ;; A base that the store does not hold (no branch held it at the fetch) can be no parent of a push to a
               ;; new branch: the commit has no parent and no foreign files then.
               base-tree (delay (when (and b (pull/readable? store b)) (store/read-tree store b)))]
           (cond-> (if (and (not new-branch?) (= digests (base-digests inst codecs base-tree b)))
                     {:result :nothing-to-push :commit b}
                     (let [findings (validate/validate s {:roots (roots/root-ids s)})]
                       (if (seq findings)
                         {:result :invalid :findings findings}
                         (let [{:keys [files] :as t} (tree codecs @base-tree s)]
                           (if-not files
                             {:result :invalid :findings (:findings t)}
                             (commit! inst store task branch message b (if @base-tree [b] []) new-branch? files digests
                                      on-record shadowed))))))
             (seq shadowed) (assoc :shadowed-tables shadowed))))))))
