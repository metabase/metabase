(ns metabase-enterprise.library-branching.push-test
  "The push, against a remote on disk and an instance in memory. The scenarios of the formal model are here: a save
  during the push, a crash between the move of the branch and the move of the base, and a remote that moves."
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.push-test-util/with-remote clojure.core/fn}}}
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.engine.merge :as merge]
   [metabase-enterprise.library-branching.engine.plan :as plan]
   [metabase-enterprise.library-branching.format.claims :as claims]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.tree :as tree]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.push :as push]
   [metabase-enterprise.library-branching.push-test-util :as ptu :refer [with-remote]]
   [metabase-enterprise.library-branching.store :as store]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- push!
  ([inst s]
   (push/push! inst s ptu/branch))
  ([inst s opts]
   (push/push! inst s ptu/branch opts)))

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
