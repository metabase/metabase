(ns metabase.mcp.v2.tools.browse-test
  "Contract tests for the v2 `browse_collection` tool.

   Everything here goes through [[registry/call-tool]] — the real dispatch, including
   null-stripping, schema validation, and teaching-error conversion — and asserts on the
   response the model actually receives. Nothing reaches into the tool's internals except the
   two threshold constants, which are rebound small so a handful of temp collections can
   exercise the cap and budget paths.

   Items-mode behaviour that is really `collection-children` behaviour — sorting, pinned
   state, model filtering, archived semantics — is covered by
   [[metabase.collections-rest.api-test]] and deliberately not duplicated here.

   Fixtures are built outside [[metabase.test/with-test-user]] on purpose: creating a
   collection while a current user is bound writes a `CollectionPermissionGraphRevision` whose
   id is `(inc (latest-id))`, which races under `^:parallel`. Only the tool call needs a user."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.tools.browse :as tools.browse]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

;;; ------------------------------------------------- helpers ------------------------------------------------------

(defn- browse
  "Call `browse_collection` as `:crowberto` (nil token-scopes bypasses the scope gate — this is
   an internal caller). Returns `{:error <text>}` for a teaching error, else
   `{:json <parsed> :line <steering line>}` — the success text is the JSON envelope optionally
   followed by a newline and the line."
  [args]
  (mt/with-test-user :crowberto
    (let [result (registry/call-tool nil nil "browse_collection" args)
          text   (-> result :content first :text)]
      (if (:isError result)
        {:error text}
        (let [[body line] (str/split text #"\n" 2)]
          {:json (json/decode+kw body) :line line})))))

(defn- parse-arg-value
  [v]
  (cond
    (re-matches #"-?\d+" v)  (parse-long v)
    (str/starts-with? v "[") (json/decode v)
    :else                    (str/replace v #"^\"|\"$" "")))

(defn- marker->args
  "Parse the call a truncation marker names into a `browse_collection` args map, e.g.

     … 1 more under \"Finance\" — browse_collection(id: 7, mode: \"tree\")
     => {:id 7 :mode \"tree\"}

   Throws when the marker names no parseable call: a marker the model cannot act on is itself
   the failure this suite is looking for."
  [marker]
  (let [argstr (or (second (re-find #"browse_collection\(([^)]*)\)" marker))
                   (throw (ex-info "marker names no parseable browse_collection call"
                                   {:marker marker})))]
    (into {}
          (map (fn [pair]
                 (let [[k v] (str/split pair #":" 2)]
                   [(keyword (str/trim k)) (parse-arg-value (str/trim v))])))
          ;; split on argument commas, not commas inside a [...] value
          (str/split argstr #",\s*(?![^\[\]]*\])"))))

(defn- tree-names
  [node]
  (into #{(:name node)} (mapcat tree-names) (:children node)))

(defn- surfaced-names
  "Every collection name a response surfaces, whichever mode produced it — so a test can follow
   a marker without knowing which mode the marker names."
  [{:keys [json]}]
  (if (contains? json :data)
    (into #{} (map :name) (:data json))
    (tree-names json)))

(defn- follow
  "Make the call `marker` names and return its response."
  [marker]
  (browse (marker->args marker)))

(defn- node-named
  "Find the node named `nm` anywhere in a tree response."
  [node nm]
  (if (= (:name node) nm)
    node
    (some #(node-named % nm) (:children node))))

;;; ---------------------------------------------- tree: markers ---------------------------------------------------
;;; The threshold tests are not ^:parallel: with-redefs mutates vars other threads read.

(deftest tree-cap-truncation-marker-advances-test
  (testing (str "GHY-4139: when a node's children are trimmed by the per-node child cap, the "
                "truncation marker must name a call that actually reaches the trimmed children. "
                "Re-rooting the same tree call re-applies the cap and returns an identical page, "
                "so the marker has to steer somewhere that pages.")
    (with-redefs [tools.browse/tree-child-cap 2]
      (mt/with-temp [:model/Collection p  {:name "browse-cap-parent"}
                     :model/Collection _a {:name "browse-cap-a" :location (collection/children-location p)}
                     :model/Collection _b {:name "browse-cap-b" :location (collection/children-location p)}
                     :model/Collection _c {:name "browse-cap-c" :location (collection/children-location p)}]
        (let [resp   (browse {:id (:id p) :mode "tree"})
              marker (-> resp :json :truncated)]
          (testing "the cap trims the third child and marks the node"
            (is (= 2 (count (-> resp :json :children))))
            (is (some? marker))
            (is (str/includes? marker "1 more")))
          (testing "children come back in name order, so the trimmed child is the last one"
            (is (= ["browse-cap-a" "browse-cap-b"]
                   (mapv :name (-> resp :json :children)))))
          (testing "obeying the marker surfaces the trimmed child"
            (is (contains? (surfaced-names (follow marker)) "browse-cap-c"))))))))

(deftest tree-budget-truncation-marker-advances-test
  (testing (str "a node left unexpanded because the total node budget ran out carries a marker; "
                "re-rooting there resets the budget, so the marker advances")
    (with-redefs [tools.browse/tree-node-budget 2]
      (mt/with-temp [:model/Collection p   {:name "browse-budget-parent"}
                     :model/Collection c1  {:name "browse-budget-a" :location (collection/children-location p)}
                     :model/Collection _g  {:name "browse-budget-grandchild" :location (collection/children-location c1)}
                     :model/Collection _c2 {:name "browse-budget-b" :location (collection/children-location p)}]
        (let [resp   (browse {:id (:id p) :mode "tree"})
              marker (:truncated (node-named (:json resp) "browse-budget-a"))]
          (testing "the budget is spent on the two children, so the grandchild is not expanded"
            (is (some? marker))
            (is (not (contains? (surfaced-names resp) "browse-budget-grandchild"))))
          (testing "obeying the marker surfaces the grandchild"
            (is (contains? (surfaced-names (follow marker)) "browse-budget-grandchild"))))))))

(deftest ^:parallel tree-depth-truncation-marker-advances-test
  (testing "a node left unexpanded at the depth limit carries a marker; re-rooting there resets depth"
    (mt/with-temp [:model/Collection p  {:name "browse-depth-parent"}
                   :model/Collection c  {:name "browse-depth-child" :location (collection/children-location p)}
                   :model/Collection _g {:name "browse-depth-grandchild" :location (collection/children-location c)}]
      (let [resp   (browse {:id (:id p) :mode "tree" :depth 1})
            marker (:truncated (node-named (:json resp) "browse-depth-child"))]
        (testing "depth 1 stops at the child"
          (is (some? marker))
          (is (not (contains? (surfaced-names resp) "browse-depth-grandchild"))))
        (testing "obeying the marker surfaces the grandchild"
          (is (contains? (surfaced-names (follow marker)) "browse-depth-grandchild")))))))

;;; ---------------------------------------------- tree: shape -----------------------------------------------------

(deftest ^:parallel tree-depth-expands-exactly-n-levels-test
  (mt/with-temp [:model/Collection p   {:name "browse-levels-parent"}
                 :model/Collection c   {:name "browse-levels-child" :location (collection/children-location p)}
                 :model/Collection g   {:name "browse-levels-grandchild" :location (collection/children-location c)}
                 :model/Collection _gg {:name "browse-levels-great" :location (collection/children-location g)}]
    (testing "depth 2 (the default) expands two levels below the root node"
      (let [names (surfaced-names (browse {:id (:id p) :mode "tree"}))]
        (is (contains? names "browse-levels-grandchild"))
        (is (not (contains? names "browse-levels-great")))))
    (testing "depth 1 expands one"
      (let [names (surfaced-names (browse {:id (:id p) :mode "tree" :depth 1}))]
        (is (contains? names "browse-levels-child"))
        (is (not (contains? names "browse-levels-grandchild")))))))

(deftest ^:parallel tree-leaf-has-no-marker-test
  (testing "a childless node reports empty children and carries no truncation marker"
    (mt/with-temp [:model/Collection p  {:name "browse-leaf-parent"}
                   :model/Collection _c {:name "browse-leaf-child" :location (collection/children-location p)}]
      (let [leaf (node-named (:json (browse {:id (:id p) :mode "tree"})) "browse-leaf-child")]
        (is (= [] (:children leaf)))
        (is (not (contains? leaf :truncated)))))))

(deftest ^:parallel tree-omits-archived-subcollections-test
  (testing "archived subtrees never appear in a tree"
    (mt/with-temp [:model/Collection p     {:name "browse-arch-parent"}
                   :model/Collection _live {:name "browse-arch-live" :location (collection/children-location p)}
                   :model/Collection _dead {:name     "browse-arch-archived"
                                            :location (collection/children-location p)
                                            :archived true}]
      (let [names (surfaced-names (browse {:id (:id p) :mode "tree"}))]
        (is (contains? names "browse-arch-live"))
        (is (not (contains? names "browse-arch-archived")))))))

(deftest ^:parallel tree-rejects-trash-test
  (testing "the trash is items-only; tree mode teaches the way out"
    (let [{:keys [error]} (browse {:id "trash" :mode "tree"})]
      (is (some? error))
      (is (str/includes? error "items")))))

(deftest ^:parallel tree-rejects-archived-collection-test
  (testing "an archived collection has no tree; the error names items mode"
    (mt/with-temp [:model/Collection c {:name "browse-arch-root" :archived true}]
      (let [{:keys [error]} (browse {:id (:id c) :mode "tree"})]
        (is (some? error))
        (is (str/includes? error "archived"))))))

;;; -------------------------------------------- namespace handling ------------------------------------------------

(deftest ^:parallel namespace-conflict-is-a-teaching-error-test
  (testing "a real collection id carries its own namespace; a contradicting namespace arg names the actual one"
    (mt/with-temp [:model/Collection snippets {:name "browse-ns-snippets" :namespace "snippets"}
                   :model/Collection content  {:name "browse-ns-content"}]
      (testing "asking for content on a snippets collection"
        (let [{:keys [error]} (browse {:id (:id snippets) :namespace "content"})]
          (is (some? error))
          (is (str/includes? error "snippets"))))
      (testing "asking for snippets on a content collection"
        (let [{:keys [error]} (browse {:id (:id content) :namespace "snippets"})]
          (is (some? error))
          (is (str/includes? error "content")))))))

(deftest ^:parallel namespace-content-equals-nil-test
  (testing "\"content\" and an absent namespace mean the same partition, so neither errors"
    (mt/with-temp [:model/Collection c {:name "browse-ns-default"}]
      (is (nil? (:error (browse {:id (:id c) :namespace "content"}))))
      (is (nil? (:error (browse {:id (:id c)})))))))

;;; -------------------------------------------- argument validation -----------------------------------------------

(deftest ^:parallel tree-mode-rejects-items-args-test
  (mt/with-temp [:model/Collection c {:name "browse-args-tree"}]
    (testing "one offending arg reads in the singular and names itself"
      (let [{:keys [error]} (browse {:id (:id c) :mode "tree" :limit 10})]
        (is (some? error))
        (is (str/includes? error "`limit`"))
        (is (str/includes? error "does not apply to tree mode"))))
    (testing "several read in the plural"
      (let [{:keys [error]} (browse {:id (:id c) :mode "tree" :limit 10 :offset 5})]
        (is (some? error))
        (is (str/includes? error "do not apply to tree mode"))))))

(deftest ^:parallel items-mode-rejects-depth-test
  (testing "depth shapes a tree; in items mode it teaches the mode switch"
    (mt/with-temp [:model/Collection c {:name "browse-args-items"}]
      (let [{:keys [error]} (browse {:id (:id c) :depth 3})]
        (is (some? error))
        (is (str/includes? error "`depth`"))
        (is (str/includes? error "tree"))))))

(deftest ^:parallel type-is-content-namespace-only-test
  (testing "type filters content items; other namespaces return their own model plus subfolders"
    (mt/with-temp [:model/Collection c {:name "browse-type-snippets" :namespace "snippets"}]
      (let [{:keys [error]} (browse {:id (:id c) :type ["question"]})]
        (is (some? error))
        (is (str/includes? error "`type`"))))))

;;; ------------------------------------------------ items mode ----------------------------------------------------

(deftest ^:parallel items-snippets-namespace-paging-test
  (testing (str "collection-children skips server-side paging for snippets-namespace collections "
                "and returns every row, so the tool slices the page itself — limit/offset must "
                "still be honoured on that path")
    (mt/with-temp [:model/Collection c {:name "browse-page-snippets" :namespace "snippets"}
                   :model/NativeQuerySnippet _1 {:collection_id (:id c) :name "browse-page-snip-a"}
                   :model/NativeQuerySnippet _2 {:collection_id (:id c) :name "browse-page-snip-b"}
                   :model/NativeQuerySnippet _3 {:collection_id (:id c) :name "browse-page-snip-c"}]
      (let [page1 (browse {:id (:id c) :limit 2 :offset 0})
            page2 (browse {:id (:id c) :limit 2 :offset 2})]
        (testing "the limit is honoured rather than returning every row"
          (is (= 2 (count (-> page1 :json :data))))
          (is (= 2 (-> page1 :json :returned))))
        (testing "the offset advances rather than repeating the first page"
          (is (not= (surfaced-names page1) (surfaced-names page2))))))))

(deftest ^:parallel items-envelope-and-projection-test
  (mt/with-temp [:model/Collection p  {:name "browse-proj-parent"}
                 :model/Collection _c {:name "browse-proj-child" :location (collection/children-location p)}]
    (testing "the envelope carries data, returned, and a total"
      (let [{:keys [json]} (browse {:id (:id p)})]
        (is (= 1 (:returned json)))
        (is (= 1 (:total json)))
        (is (= ["browse-proj-child"] (mapv :name (:data json))))))
    (testing "concise (the default) omits the detailed-only keys"
      (let [row (-> (browse {:id (:id p)}) :json :data first)]
        (is (not (contains? row :entity_id)))
        (is (not (contains? row :location)))))
    (testing "detailed adds them"
      (let [row (-> (browse {:id (:id p) :response_format "detailed"}) :json :data first)]
        (is (contains? row :entity_id))
        (is (contains? row :location))))
    (testing "fields picks dot-paths from the detailed shape"
      (let [row (-> (browse {:id (:id p) :fields ["name" "entity_id"]}) :json :data first)]
        (is (= #{:name :entity_id} (set (keys row))))))
    (testing "fields and response_format are mutually exclusive"
      (is (some? (:error (browse {:id (:id p) :fields ["name"] :response_format "detailed"})))))))

(deftest ^:parallel items-truncation-line-test
  (mt/with-temp [:model/Collection p  {:name "browse-line-parent"}
                 :model/Collection _a {:name "browse-line-a" :location (collection/children-location p)}
                 :model/Collection _b {:name "browse-line-b" :location (collection/children-location p)}]
    (testing "a truncated content-namespace page steers with `type`"
      (let [{:keys [line]} (browse {:id (:id p) :limit 1})]
        (is (some? line))
        (is (str/includes? line "`type`"))
        (is (str/includes? line "offset: 1"))))
    (testing "a complete page carries no steering line"
      (is (nil? (:line (browse {:id (:id p) :limit 50})))))))

;;; ------------------------------------------------ resolution ----------------------------------------------------

(deftest ^:parallel unreadable-collection-is-not-an-existence-oracle-test
  (testing "a collection that exists but is unreadable reports the same not-found as one that never existed"
    (mt/with-temp [:model/Collection c {:name     "browse-secret"
                                        :location (collection/children-location
                                                   (collection/user->personal-collection
                                                    (mt/user->id :crowberto)))}]
      (mt/with-test-user :rasta
        (let [result (registry/call-tool nil nil "browse_collection" {:id (:id c)})
              text   (-> result :content first :text)]
          (is (:isError result))
          (is (str/includes? text "may not exist")))))))
