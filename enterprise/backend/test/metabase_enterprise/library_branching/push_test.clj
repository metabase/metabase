(ns metabase-enterprise.library-branching.push-test
  "The push, against a remote on disk and an instance in memory. The scenarios of the formal models are here: a save
  during the push, a crash between the move of the branch and the move of the base, a remote that moves, and the
  TaskLease traces of a push (a cancel at each side of the commit point, and a paused push that wakes up after its
  task was superseded). Each push runs as a task, whose row is in the app DB."
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.push-test-util/with-remote clojure.core/fn}}}
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.engine.merge :as merge]
   [metabase-enterprise.library-branching.engine.plan :as plan]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library-branching.format.claims :as claims]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.tree :as tree]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.push :as push]
   [metabase-enterprise.library-branching.push-test-util :as ptu :refer [with-remote]]
   [metabase-enterprise.library-branching.store :as store]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase-enterprise.library-branching.tasks-test-util :as tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db) features.tu/with-features)

(defn- push!
  ([inst s]
   (ptu/push! inst s))
  ([inst s opts]
   (ptu/push! inst s opts)))

(defmacro ^:private enabled
  [& body]
  `(mt/with-temporary-setting-values [~'library-branching-enabled true]
     ~@body))

(defn- tree-of
  "The tree of `commit` with the bytes of each file as text."
  [s commit]
  (update-vals (store/read-tree s commit) #(String. ^bytes % "UTF-8")))

;;; ------------------------------------------------- The first push -------------------------------------------------

(deftest first-push-writes-the-snapshot-test
  (enabled
   (with-remote [repo s]
     (let [state (atom {:snapshot ptu/sample})
           inst  (ptu/fake-instance state)
           {:keys [result commit]} (push! inst s {:message "First"})]
       (testing "a push with no base to a branch that does not exist creates the branch"
         (is (= :pushed result))
         (is (= commit (ptu/remote-head repo)))
         (is (= [] (ptu/commit-parents repo commit))))
       (testing "the commit holds the snapshot, in the encoding of the format, with the format version file"
         (is (= ptu/sample (ptu/commit-snapshot s commit)))
         (is (= (update-vals (writer/encode-tree kinds/codecs ptu/sample) #(String. ^bytes % "UTF-8"))
                (tree-of s commit)))
         (is (contains? (tree-of s commit) tree/format-path)))
       (testing "the base is the commit, with the digests of the pushed snapshot"
         (is (= commit (instance/base inst)))
         (is (= (writer/item-digests kinds/codecs ptu/sample) (instance/base-digests inst commit)))
         (is (= {:created #{} :deleted #{} :updated #{}} (ptu/local-changes inst))))))))

(deftest push-with-no-base-refuses-an-existing-branch-test
  (enabled
   (with-remote [repo s]
     (let [other (ptu/remote-commit! repo [] {"README.md" (ptu/utf8 "hello")})
           inst  (ptu/fake-instance (atom {:snapshot ptu/sample}))]
       (testing "with no base, a branch that exists is a remote that moved: the caller pulls first"
         (is (= {:result :remote-moved :base nil :head other} (push! inst s)))
         (is (= other (ptu/remote-head repo)))
         (is (nil? (instance/base inst))))))))

(deftest disabled-push-writes-nothing-test
  (mt/with-temporary-setting-values [library-branching-enabled false]
    (with-remote [repo s]
      (let [inst (ptu/fake-instance (atom {:snapshot ptu/sample}))]
        (is (= {:result :disabled} (push! inst s)))
        (is (nil? (ptu/remote-head repo)))
        (is (nil? (instance/base inst)))))))

;;; ------------------------------------------------- Local changes --------------------------------------------------

(deftest push-writes-every-local-change-test
  (enabled
   (with-remote [repo s]
     (let [state  (atom {:snapshot ptu/sample})
           inst   (ptu/fake-instance state)
           c1  (:commit (push! inst s))
           before (tree-of s c1)
           added  "NewSnippet00000000001"
           local  (-> ptu/sample
                      (assoc-in [ptu/revenue-id :attrs :description] "Sum of revenue.")
                      (ptu/renamed ptu/snippet-id "Active rows")
                      (dissoc ptu/orders-id)
                      (assoc added (ptu/item added :snippet "Recent" ptu/library-id {:content "recent = true"})))]
       (swap! state assoc :snapshot local)
       (let [{:keys [result commit]} (push! inst s)
             after                   (tree-of s commit)]
         (testing "one push writes every local change: an update, a rename, a trash and a new item"
           (is (= :pushed result))
           (is (= local (ptu/commit-snapshot s commit)))
           (is (= [c1] (ptu/commit-parents repo commit))))
         (testing "a renamed item moves to the path of its new name; exactly one file holds each identity"
           (is (some #(str/includes? % "active.snippet.yaml") (keys before)))
           (is (not-any? #(str/includes? % "/active.snippet.yaml") (keys after)))
           (is (= 1 (count (filter #(str/includes? % ptu/snippet-id) (vals after))))))
         (testing "the file of an item with no change keeps its bytes"
           (is (= (get before "library/metrics/_collection.yaml") (get after "library/metrics/_collection.yaml")))))))))

(deftest nothing-to-push-test
  (enabled
   (with-remote [repo s]
     (let [state (atom {:snapshot ptu/sample})
           inst  (ptu/fake-instance state)
           c1 (:commit (push! inst s))]
       (testing "with no local change, a push makes no commit and leaves the branch and the base"
         (is (= {:result :nothing-to-push :commit c1} (push! inst s)))
         (is (= c1 (ptu/remote-head repo)))
         (is (= c1 (instance/base inst))))
       (testing "a change and its revert before the push are no local change"
         (swap! state update :snapshot ptu/renamed ptu/revenue-id "Changed")
         (swap! state update :snapshot ptu/renamed ptu/revenue-id "Revenue")
         (is (= {:result :nothing-to-push :commit c1} (push! inst s))))
       (testing "with no digests stored for the base, the push compares with the tree of the base"
         (swap! state assoc :digests nil)
         (is (= {:result :nothing-to-push :commit c1} (push! inst s))))))))

(deftest trashed-item-leaves-the-repository-test
  (enabled
   (with-remote [_repo s]
     (let [state (atom {:snapshot ptu/sample})
           inst  (ptu/fake-instance state)]
       (push! inst s)
       (testing "an item that leaves the synced snapshot (a trash) has no file in the next commit"
         (swap! state update :snapshot dissoc ptu/snippet-id)
         (let [{:keys [commit]} (push! inst s)]
           (is (not (contains? (ptu/commit-snapshot s commit) ptu/snippet-id)))
           (is (not-any? #(str/includes? % ptu/snippet-id) (vals (tree-of s commit))))))))))

;;; ------------------------------------------------- A moved remote -------------------------------------------------

(deftest moved-remote-refuses-test
  (enabled
   (with-remote [repo s]
     (let [state (atom {:snapshot ptu/sample})
           inst  (ptu/fake-instance state)
           c1 (:commit (push! inst s))
           other (ptu/remote-commit! repo [c1] {"README.md" (ptu/utf8 "someone else")})]
       (swap! state update :snapshot ptu/renamed ptu/revenue-id "Changed")
       (testing "when the branch is not at the base, the push refuses and writes nothing"
         (is (= {:result :remote-moved :base c1 :head other} (push! inst s)))
         (is (= other (ptu/remote-head repo)))
         (is (= c1 (instance/base inst))))))))

(deftest remote-that-moves-during-the-push-refuses-test
  (enabled
   (with-remote [repo s]
     (let [state (atom {:snapshot ptu/sample})
           inst  (ptu/fake-instance state)
           c1 (:commit (push! inst s))
           other (promise)
           racing (ptu/wrap-store s (fn []
                                      (when-not (realized? other)
                                        (deliver other (ptu/remote-commit! repo [c1] {"README.md" (ptu/utf8 "x")})))))]
       (swap! state update :snapshot ptu/renamed ptu/revenue-id "Changed")
       (testing "the branch moves after the push read its head: the compare-and-swap refuses, and nothing changes"
         (let [result (push! inst racing)]
           (is (= {:result :remote-moved :base c1 :head (deref other 0 ::none)} result)))
         (is (= @other (ptu/remote-head repo)))
         (is (= c1 (instance/base inst)))
         (is (= {:created #{} :deleted #{} :updated #{ptu/revenue-id}} (ptu/local-changes inst))))))))

;;; ------------------------------------------------ A save during the push ------------------------------------------

(deftest save-during-push-stays-a-local-change-test
  (enabled
   (with-remote [_repo s]
     (let [state  (atom {:snapshot ptu/sample})
           inst   (ptu/fake-instance state)
           c1  (:commit (push! inst s))
           read   (ptu/renamed ptu/sample ptu/revenue-id "Read")
           saved  (ptu/renamed ptu/sample ptu/revenue-id "Saved")
           racing (ptu/wrap-instance inst {:read-snapshot (fn [read-snapshot]
                                                            (let [r (read-snapshot)]
                                                              ;; a person saves right after the read point
                                                              (swap! state assoc :snapshot saved)
                                                              r))})]
       (swap! state assoc :snapshot read)
       (let [{:keys [result commit]} (push! racing s)]
         (testing "the push writes the snapshot of its read point"
           (is (= :pushed result))
           (is (not= c1 commit))
           (is (= read (ptu/commit-snapshot s commit))))
         (testing "the save after the read point is a local change against the new base: it does not show as synced"
           (is (= commit (instance/base inst)))
           (is (= {:created #{} :deleted #{} :updated #{ptu/revenue-id}} (ptu/local-changes inst))))
         (testing "the next push carries the save"
           (let [next-push (push! inst s)]
             (is (= :pushed (:result next-push)))
             (is (= saved (ptu/commit-snapshot s (:commit next-push)))))))))))

;;; ------------------------------------------- A crash after the branch moved ----------------------------------------

(deftest crash-between-branch-and-base-test
  (enabled
   (with-remote [repo s]
     (let [state   (atom {:snapshot ptu/sample})
           inst    (ptu/fake-instance state)
           c1   (:commit (push! inst s))
           local   (ptu/renamed ptu/sample ptu/revenue-id "Changed")
           crashes (ptu/wrap-instance inst {:set-base! (fn [_set-base! & _]
                                                         (throw (ex-info "crash" {::crash true})))})]
       (swap! state assoc :snapshot local)
       (is (thrown-with-msg? clojure.lang.ExceptionInfo #"crash" (push! crashes s)))
       (let [head (ptu/remote-head repo)]
         (testing "the branch holds the pushed snapshot, and the base did not move"
           (is (not= c1 head))
           (is (= local (ptu/commit-snapshot s head)))
           (is (= c1 (instance/base inst))))
         (testing "the next push refuses, so the commit on the branch is never written over"
           (is (= {:result :remote-moved :base c1 :head head} (push! inst s))))
         (testing "a pull merges the head with no conflict and plans no write, so it only moves the base"
           (let [b (ptu/commit-snapshot s c1)
                 r (ptu/commit-snapshot s head)
                 l (:snapshot (instance/read-snapshot inst))
                 {m :ok :as merged} (merge/merge b l r {})]
             (is (= {:ok local} merged))
             (is (= [] (plan/plan l m b))))))))))

;;; ---------------------------------------------------- Validation --------------------------------------------------

(deftest push-refuses-a-reference-to-an-item-out-of-scope-test
  (enabled
   (with-remote [repo s]
     (let [trashed "TrashedMetric00000001"
           user    (ptu/item ptu/revenue-id :metric "Revenue" ptu/metrics-id
                             {:display "scalar" :query (ptu/count-query ptu/orders-table trashed)})
           state   (atom {:snapshot (assoc ptu/sample ptu/revenue-id user)})
           inst    (ptu/fake-instance state)]
       (testing "a Library metric that uses a metric outside the snapshot (in the trash): the push refuses and names
                the pair"
         (is (= {:result   :invalid
                 :findings [{:rule :refs-closed :id ptu/revenue-id :ref [:metric trashed]}]}
                (push! inst s)))
         (is (nil? (ptu/remote-head repo)))
         (is (nil? (instance/base inst))))))))

(deftest push-refuses-an-item-at-the-root-that-is-no-root-test
  (enabled
   (with-remote [repo s]
     (let [stray "StrayCollection000001"
           inst  (ptu/fake-instance (atom {:snapshot (assoc ptu/sample stray
                                                            (ptu/item stray :collection "Stray" nil {}))}))]
       (is (= {:result :invalid :findings [{:rule :root :id stray}]} (push! inst s)))
       (is (nil? (ptu/remote-head repo)))))))

;;; -------------------------------------------- Foreign files and old format -----------------------------------------

(def ^:private manifest
  "format: library-branching-manifest/1\ndatabases: []\n")

(deftest foreign-files-stay-and-moved-files-go-back-test
  (enabled
   (with-remote [repo s]
     (let [state (atom {:snapshot ptu/sample})
           inst  (ptu/fake-instance state)
           c1 (:commit (push! inst s))
           t     (store/read-tree s c1)
           path  (some #(when (str/includes? % "revenue.metric.yaml") %) (keys t))
           ;; someone adds foreign files and moves a file of an item in git
           moved (ptu/remote-commit! repo [c1] (-> t
                                                   (dissoc path)
                                                   (assoc "elsewhere/revenue.yaml" (get t path)
                                                          "README.md" (ptu/utf8 "# Library")
                                                          ".github/workflows/check.yml" (ptu/utf8 "on: push")
                                                          "notes/plan.txt" (ptu/utf8 "plan")
                                                          "apps/sales/i18n/en.yaml" (ptu/utf8 "hello: Hello\n")
                                                          "library/broken.yaml" (ptu/utf8 "kind: [\n")
                                                          ".metabase/manifest.yaml" (ptu/utf8 manifest))))]
       (swap! state assoc :base moved :digests nil)
       (swap! state update :snapshot ptu/renamed ptu/orders-id "All orders")
       (let [{:keys [result commit]} (push! inst s)
             after                   (tree-of s commit)]
         (is (= :pushed result))
         (testing "the files that sync does not own stay, with their bytes: foreign files, YAML files that are not
                  item files, and the manifest"
           (is (= {"README.md"                   "# Library"
                   ".github/workflows/check.yml" "on: push"
                   "notes/plan.txt"              "plan"
                   "apps/sales/i18n/en.yaml"     "hello: Hello\n"
                   "library/broken.yaml"         "kind: [\n"
                   ".metabase/manifest.yaml"     manifest}
                  (select-keys after ["README.md" ".github/workflows/check.yml" "notes/plan.txt"
                                      "apps/sales/i18n/en.yaml" "library/broken.yaml" ".metabase/manifest.yaml"]))))
         (testing "the moved file is written back at its canonical path"
           (is (contains? after path))
           (is (not (contains? after "elsewhere/revenue.yaml"))))
         (testing "the item files and the format version file are exactly the encoding of the snapshot"
           (is (= (update-vals (writer/encode-tree kinds/codecs (:snapshot @state)) #(String. ^bytes % "UTF-8"))
                  (update-vals (claims/claimed-files (claims/item-claims (store/read-tree s commit)))
                               #(String. ^bytes % "UTF-8"))))))))))

(def ^:private old-format-files
  "A tree that remote sync wrote."
  {"collections/main/library/library.yaml"
   (ptu/utf8 "name: Library\nentity_id: OldLibraryCollection1\nserdes/meta:\n- id: OldLibraryCollection1\n  model: Collection\n")
   "databases/sample_database/schemas/public/tables/orders/orders___tableusersettings.yaml"
   (ptu/utf8 "serdes/meta:\n- model: Database\n  id: Sample Database\n")
   "README.md" (ptu/utf8 "# Our content")})

(deftest first-push-to-an-old-format-tree-test
  (enabled
   (with-remote [repo s]
     (let [old   (ptu/remote-commit! repo [] old-format-files)
           state (atom {:snapshot ptu/sample :base old})
           inst  (ptu/fake-instance state)]
       (is (= old (store/head s ptu/branch)))
       (is (claims/old-format? (claims/item-claims (store/read-tree s old))))
       (let [{:keys [result commit]} (push! inst s)
             after                   (tree-of s commit)]
         (testing "the first push to a tree in the old format writes, in one commit on the old head, the new layout
                  and the format version file"
           (is (= :pushed result))
           (is (= [old] (ptu/commit-parents repo commit)))
           (is (= "format: library-branching/1\n" (get after tree/format-path)))
           (is (= ptu/sample (ptu/commit-snapshot s commit))))
         (testing "no file of the old format stays; a foreign file stays"
           (is (= #{} (set (filter #(str/starts-with? % "collections/") (keys after)))))
           (is (= #{} (set (filter #(str/starts-with? % "databases/") (keys after)))))
           (is (= "# Our content" (get after "README.md"))))
         (testing "the next push with no change has nothing to push"
           (is (= {:result :nothing-to-push :commit commit} (push! inst s)))))))))

(def ^:private revenue-path "library/metrics/revenue.metric.yaml")

(def ^:private revenue-suffixed-path
  (str "library/metrics/revenue~" ptu/revenue-id ".metric.yaml"))

(defn- base-with!
  "Commits on `c1` the tree of `c1` changed by `f`, as a person who edits the repository, and makes it the base of the
  instance state `state`, with no digests: the push compares with the tree of the base."
  [repo s state c1 f]
  (let [h (ptu/remote-commit! repo [c1] (f (store/read-tree s c1)))]
    (swap! state assoc :base h :digests nil)
    h))

(defn- moved-under
  "Tree `t` with each file under the directory `from` moved under the directory `to`."
  [t from to]
  (into {}
        (map (fn [[p b]] [(if (str/starts-with? p (str from "/")) (str to (subs p (count from))) p) b]))
        t))

(deftest foreign-file-at-the-path-of-an-item-stays-test
  (testing "M6-068 and M6-069: a file that is not an item file sits at the path of an item. The push keeps it with
            its bytes, and writes the item at the path with its identity as a suffix"
    (doseq [[label text] [["text" "These are notes, not an item."]
                          ["YAML that does not parse" "kind: [\n"]
                          ["a YAML map that is no item file" "name: Revenue\n"]]]
      (testing label
        (enabled
         (with-remote [repo s]
           (let [state (atom {:snapshot ptu/sample})
                 inst  (ptu/fake-instance state)
                 c1    (:commit (push! inst s))]
             (base-with! repo s state c1 #(assoc % revenue-path (ptu/utf8 text)))
             (swap! state update :snapshot ptu/renamed ptu/orders-id "All orders")
             (let [{:keys [result commit]} (push! inst s)
                   after                   (tree-of s commit)]
               (is (= :pushed result))
               (is (= text (get after revenue-path)))
               (is (str/includes? (get after revenue-suffixed-path) (str "id: " ptu/revenue-id)))
               (is (= (:snapshot @state) (ptu/commit-snapshot s commit)))
               (testing "the next push with no change has nothing to push"
                 (is (= {:result :nothing-to-push :commit commit} (push! inst s))))))))))))

(deftest foreign-file-at-the-suffixed-path-too-test
  (testing "the path of an item and the path with its identity as a suffix both hold foreign files: the item gets a
            number after its suffix, and both foreign files stay"
    (enabled
     (with-remote [repo s]
       (let [state (atom {:snapshot ptu/sample})
             inst  (ptu/fake-instance state)
             c1    (:commit (push! inst s))]
         (base-with! repo s state c1 #(assoc % revenue-path (ptu/utf8 "one") revenue-suffixed-path (ptu/utf8 "two")))
         (swap! state update :snapshot ptu/renamed ptu/orders-id "All orders")
         (let [{:keys [result commit]} (push! inst s)
               after                   (tree-of s commit)]
           (is (= :pushed result))
           (is (= ["one" "two"] [(get after revenue-path) (get after revenue-suffixed-path)]))
           (is (str/includes? (get after (str "library/metrics/revenue~" ptu/revenue-id "~2.metric.yaml"))
                              (str "id: " ptu/revenue-id)))
           (is (= (:snapshot @state) (ptu/commit-snapshot s commit)))))))))

(deftest foreign-file-where-a-directory-of-an-item-is-test
  (testing "a foreign file has the path of the directory of a collection, or a foreign directory has the path of the
            file of a metric: the push keeps the foreign file, and the item gets its identity as a suffix"
    (doseq [[label edit kept item-path]
            [["a file at the path of a directory"
              #(-> % (moved-under "library/metrics" "library/elsewhere") (assoc "library/metrics" (ptu/utf8 "a file")))
              "library/metrics"
              (str "library/metrics~" ptu/metrics-id "/_collection.yaml")]
             ["a directory at the path of a file"
              #(-> % (dissoc revenue-path) (assoc (str revenue-path "/README.md") (ptu/utf8 "a file")))
              (str revenue-path "/README.md")
              revenue-suffixed-path]]]
      (testing label
        (enabled
         (with-remote [repo s]
           (let [state (atom {:snapshot ptu/sample})
                 inst  (ptu/fake-instance state)
                 c1    (:commit (push! inst s))]
             (base-with! repo s state c1 edit)
             (swap! state update :snapshot ptu/renamed ptu/orders-id "All orders")
             (let [{:keys [result commit]} (push! inst s)
                   after                   (tree-of s commit)]
               (is (= :pushed result))
               (is (= "a file" (get after kept)))
               (is (contains? after item-path))
               (is (= (:snapshot @state) (ptu/commit-snapshot s commit)))))))))))

(deftest push-never-overwrites-a-foreign-file-test
  (testing "a foreign file at a path that no suffix can avoid (the format version file, or a fixed directory of the
            layout): the push refuses with the two paths, and writes nothing"
    (doseq [[label edit finding]
            [["the format version file"
              #(assoc % tree/format-path (ptu/utf8 "notes: mine\n"))
              {:rule :foreign-path :path tree/format-path :foreign tree/format-path}]
             ["the fixed directory of the snippets"
              #(-> % (moved-under "snippets" "elsewhere") (assoc "snippets" (ptu/utf8 "a file")))
              {:rule :foreign-path :path "snippets/active.snippet.yaml" :foreign "snippets"}]]]
      (testing label
        (enabled
         (with-remote [repo s]
           (let [state (atom {:snapshot ptu/sample})
                 inst  (ptu/fake-instance state)
                 c1    (:commit (push! inst s))
                 h     (base-with! repo s state c1 edit)]
             (swap! state update :snapshot ptu/renamed ptu/orders-id "All orders")
             (is (= {:result :invalid :findings [finding]} (push! inst s)))
             (is (= h (ptu/remote-head repo)))
             (is (= h (instance/base inst))))))))))

(deftest files-that-sync-does-not-own-stay-in-the-directory-of-an-item-test
  (testing "M11-038, the push part: the directory of a collection holds the files of an app (App.tsx, package.json,
            YAML files that are not item files). A push of a change, and a push that removes the collection, keep them
            and remove only the item files"
    (enabled
     (with-remote [repo s]
       (let [state   (atom {:snapshot ptu/sample})
             inst    (ptu/fake-instance state)
             c1      (:commit (push! inst s))
             foreign {"library/metrics/App.tsx"      "export default function App() {}"
                      "library/metrics/package.json" "{\"name\": \"app\"}"
                      "library/metrics/broken.yaml"  "kind: [\n"
                      "library/metrics/i18n/en.yaml" "hello: Hello\n"}]
         (base-with! repo s state c1 #(merge % (update-vals foreign ptu/utf8)))
         (swap! state update :snapshot ptu/renamed ptu/orders-id "All orders")
         (let [{:keys [result commit]} (push! inst s)]
           (is (= :pushed result))
           (is (= foreign (select-keys (tree-of s commit) (keys foreign)))))
         (swap! state update :snapshot dissoc ptu/metrics-id ptu/revenue-id ptu/orders-id)
         (let [{:keys [result commit]} (push! inst s)
               after                   (tree-of s commit)]
           (is (= :pushed result))
           (is (= foreign (select-keys after (keys foreign))))
           (is (= #{} (set (remove (set (keys foreign)) (filter #(str/starts-with? % "library/metrics/") (keys after))))))
           (is (= (:snapshot @state) (ptu/commit-snapshot s commit)))))))))

;;; ------------------------------------------------- The task of a push ---------------------------------------------

(defn- task-row [id]
  (select-keys (tasks/task id) [:status :outcome :error_message]))

(deftest push-ends-its-task-past-the-commit-point-test
  (enabled
   (with-remote [_repo s]
     (let [state (atom {:snapshot ptu/sample})
           inst  (ptu/fake-instance state)]
       (testing "a push that lands ends its task as successful, with the outcome that names the branch and the commit"
         (ptu/do-with-push-task!
          (fn [task]
            (let [{:keys [result commit]} (push/push! inst s ptu/branch task)]
              (is (= :pushed result))
              (is (= {:status "successful" :outcome {:kind "pushed" :branch ptu/branch :commit commit} :error_message nil}
                     (task-row task)))))))
       (testing "a push that stops before its commit point leaves its task running, for its caller to end"
         (ptu/do-with-push-task!
          (fn [task]
            (is (= :nothing-to-push (:result (push/push! inst s ptu/branch task))))
            (is (= "running" (:status (tasks/task task)))))))))))

(deftest cancel-before-the-commit-point-stops-the-push-test
  (testing "TaskLease nocommitpoint: a push reads the instance, then its task ends (an admin cancels it, or a reader
            supersedes it): the push stops at its commit point, so the branch and the base do not move"
    (doseq [[label end! status] [["a cancel" tasks/cancel! "cancelled"]
                                 ["a supersede" #(do (tu/pause! %) (tasks/supersede-stale!)) "interrupted"]]]
      (testing label
        (enabled
         (with-remote [repo s]
           (let [state (atom {:snapshot ptu/sample})
                 inst  (ptu/fake-instance state)
                 c1    (:commit (push! inst s))]
             (swap! state update :snapshot ptu/renamed ptu/revenue-id "Changed")
             (ptu/do-with-push-task!
              (fn [task]
                (let [racing (ptu/wrap-instance inst {:read-snapshot (fn [read-snapshot]
                                                                       (let [r (read-snapshot)]
                                                                         (end! task)
                                                                         r))})]
                  (is (= {:result :fenced :status status} (push/push! racing s ptu/branch task)))
                  (is (= c1 (ptu/remote-head repo)))
                  (is (= c1 (instance/base inst)))
                  (is (= status (:status (tasks/task task))))
                  (is (= {:created #{} :deleted #{} :updated #{ptu/revenue-id}} (ptu/local-changes inst)))))))))))))

(deftest cancel-after-the-commit-point-is-refused-test
  (testing "TaskLease nocommitpoint: an admin cancels a push after its commit point. The cancel is refused, and the
            push lands, records its base, and ends its task as successful"
    (enabled
     (with-remote [repo s]
       (let [inst (ptu/fake-instance (atom {:snapshot ptu/sample}))]
         (ptu/do-with-push-task!
          (fn [task]
            (let [cancel (promise)
                  racing (ptu/wrap-store s #(deliver cancel (tasks/cancel! task)))
                  {:keys [result commit]} (push/push! inst racing ptu/branch task)]
              (is (= {:refused "committing"} (deref cancel 0 ::none)))
              (is (= :pushed result))
              (is (= commit (ptu/remote-head repo)))
              (is (= commit (instance/base inst)))
              (is (= "successful" (:status (tasks/task task))))))))))))

(deftest remote-refusal-after-the-commit-point-fails-the-task-test
  (testing "the branch moves after the commit point of a push: the remote compare-and-swap refuses, the push did not
            land, so its task ends as failed, not as interrupted"
    (enabled
     (with-remote [repo s]
       (let [state (atom {:snapshot ptu/sample})
             inst  (ptu/fake-instance state)
             c1    (:commit (push! inst s))
             other (promise)
             racing (ptu/wrap-store s #(when-not (realized? other)
                                         (deliver other (ptu/remote-commit! repo [c1] {"README.md" (ptu/utf8 "x")}))))]
         (swap! state update :snapshot ptu/renamed ptu/revenue-id "Changed")
         (ptu/do-with-push-task!
          (fn [task]
            (let [result (push/push! inst racing ptu/branch task)]
              (is (= {:result :remote-moved :base c1 :head (deref other 0 ::none)} result)))
            (is (= c1 (instance/base inst)))
            (is (= {:status "failed" :error_message (push/remote-moved-message ptu/branch)}
                   (select-keys (task-row task) [:status :error_message]))))))))))

(deftest paused-push-cannot-move-the-base-back-test
  (testing "TaskLease nocas: a push lands on the branch, then its worker pauses before the record step, and a reader
            supersedes its task. A pull moves the base to the commit of the push, and a new push moves it on. When
            the paused push wakes up, its record step finds another base, and keeps it"
    (enabled
     (with-remote [repo s]
       (let [state  (atom {:snapshot ptu/sample})
             inst   (ptu/fake-instance state)
             c1     (:commit (push! inst s))
             first-snap (ptu/renamed ptu/sample ptu/revenue-id "First")
             landed (promise)
             later  (promise)]
         (swap! state assoc :snapshot first-snap)
         (ptu/do-with-push-task!
          (fn [task]
            (let [paused (ptu/wrap-store
                          s
                          (constantly nil)
                          (fn []
                            (let [c2 (ptu/remote-head repo)]
                              (deliver landed c2)
                              (tu/pause! task)
                              (tasks/supersede-stale!)
                              ;; the pull sees the snapshot of the push on both sides, and only moves the base
                              (instance/set-base! inst c1 c2 (writer/item-digests kinds/codecs first-snap))
                              (swap! state update :snapshot ptu/renamed ptu/revenue-id "Second")
                              (deliver later (push! inst s)))))
                  result (push/push! inst paused ptu/branch task)
                  c3     (:commit (deref later 0 nil))]
              (is (= :pushed (:result (deref later 0 nil))))
              (is (= [(deref landed 0 nil)] (ptu/commit-parents repo c3)))
              (is (= {:result :base-moved :commit (deref landed 0 nil) :base c3} result))
              (is (= c3 (instance/base inst)))
              (is (= c3 (ptu/remote-head repo)))
              (is (= "interrupted" (:status (tasks/task task))))
              (testing "the base content is the content of the newest push"
                (is (= {:created #{} :deleted #{} :updated #{}} (ptu/local-changes inst))))))))))))

;;; ---------------------------------------------------- Properties --------------------------------------------------

(defspec push-sequence-property-test 25
  (prop/for-all [snapshots (gen/vector ptu/pushable-snapshot-gen 1 4)]
    (enabled
     (with-remote [repo s]
       (let [state (atom {})
             inst  (ptu/fake-instance state)]
         (every? true?
                 (for [snap snapshots]
                   (let [base-before                  (instance/base inst)
                         content-before               (if base-before (ptu/commit-snapshot s base-before) {})
                         _                            (swap! state assoc :snapshot snap)
                         {:keys [result commit] :as r} (push! inst s)]
                     (and (if (= snap content-before)
                            (= {:result :nothing-to-push :commit base-before} r)
                            (and (= :pushed result)
                                 (= (if base-before [base-before] []) (ptu/commit-parents repo commit))))
                          ;; after every push: the branch, the base and the digests agree with the snapshot
                          (= (instance/base inst) (ptu/remote-head repo))
                          (if-let [b (instance/base inst)]
                            (and (= snap (ptu/commit-snapshot s b))
                                 (= (writer/item-digests kinds/codecs snap) (instance/base-digests inst b)))
                            (= {} snap)))))))))))
