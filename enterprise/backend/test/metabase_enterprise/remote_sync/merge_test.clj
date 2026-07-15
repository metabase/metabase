(ns metabase-enterprise.remote-sync.merge-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.merge :as remote-sync.merge]))

(defn- card
  "Builds a `{:path :content}` spec for a Card with the given entity `id`, `name` (which drives the on-disk
  path, as in real serialization) and an optional `extra` content fragment to vary the body."
  ([id name] (card id name ""))
  ([id name extra]
   {:path    (str "collections/" name ".yaml")
    :content (str "serdes/meta:\n- model: Card\n  id: " id "\n  label: " name "\nname: " name "\n" extra)}))

(defn- ids
  "Sorted entity ids present in a merge result's :merged set."
  [result]
  (sort (map (fn [{:keys [content]}]
               (second (re-find #"id: (\w+)" content)))
             (:merged result))))

(deftest ^:parallel clean-merge-disjoint-changes-test
  (testing "local edits A and adds C; remote adds D; B untouched -> all merged, no conflict"
    (let [base   [(card "A" "a") (card "B" "b")]
          ours   [(card "A" "a" "x: 1\n") (card "B" "b") (card "C" "c")]
          theirs [(card "A" "a") (card "B" "b") (card "D" "d")]
          result (remote-sync.merge/three-way-merge base ours theirs)]
      (is (empty? (:conflicts result)))
      (is (= ["A" "B" "C" "D"] (ids result)))
      (testing "only D is counted as a folded-in remote add"
        (is (= {:added 1 :updated 0 :removed 0} (:summary result)))))))

(deftest ^:parallel conflict-same-entity-edited-both-sides-test
  (testing "A edited differently on both sides -> conflict, nothing merged for A"
    (let [result (remote-sync.merge/three-way-merge
                  [(card "A" "a")]
                  [(card "A" "a" "x: ours\n")]
                  [(card "A" "a" "x: theirs\n")])]
      (is (= 1 (count (:conflicts result))))
      (is (empty? (:merged result))))))

(deftest ^:parallel local-edit-vs-remote-rename-is-conflict-test
  (testing "local edits A's content while remote renames A -> conflict (both changed the same entity)"
    (let [result (remote-sync.merge/three-way-merge
                  [(card "A" "a")]
                  [(card "A" "a" "x: 1\n")]
                  [(card "A" "a2")])]
      (is (= 1 (count (:conflicts result)))))))

(deftest ^:parallel rename-to-different-names-no-duplicate-test
  (testing "both sides rename A to different names -> conflict, and crucially NO duplicate entity files"
    (let [result (remote-sync.merge/three-way-merge
                  [(card "A" "a")]
                  [(card "A" "bar")]
                  [(card "A" "baz")])]
      (is (= 1 (count (:conflicts result))))
      (is (empty? (:merged result))
          "a path-keyed merge would wrongly keep both bar.yaml and baz.yaml (same entity_id)"))))

(deftest ^:parallel remote-only-rename-takes-theirs-test
  (testing "only remote renames A; local untouched -> take remote's path+content, no conflict"
    (let [result (remote-sync.merge/three-way-merge
                  [(card "A" "a")]
                  [(card "A" "a")]
                  [(card "A" "renamed")])]
      (is (empty? (:conflicts result)))
      (is (= ["collections/renamed.yaml"] (map :path (:merged result))))
      (is (= {:added 0 :updated 1 :removed 0} (:summary result))))))

(deftest ^:parallel remote-delete-takes-effect-test
  (testing "remote deletes A; local untouched -> A removed from merged, counted as remote removal"
    (let [result (remote-sync.merge/three-way-merge
                  [(card "A" "a") (card "B" "b")]
                  [(card "A" "a") (card "B" "b")]
                  [(card "B" "b")])]
      (is (empty? (:conflicts result)))
      (is (= ["B"] (ids result)))
      (is (= {:added 0 :updated 0 :removed 1} (:summary result))))))

(deftest ^:parallel local-delete-vs-remote-edit-is-conflict-test
  (testing "local deletes A while remote edits A -> modify/delete conflict"
    (let [result (remote-sync.merge/three-way-merge
                  [(card "A" "a")]
                  []
                  [(card "A" "a" "x: 1\n")])]
      (is (= 1 (count (:conflicts result)))))))

(deftest ^:parallel both-delete-is-clean-test
  (testing "both sides delete A -> clean, A gone, not counted as a remote change"
    (let [result (remote-sync.merge/three-way-merge
                  [(card "A" "a")]
                  []
                  [])]
      (is (empty? (:conflicts result)))
      (is (empty? (:merged result)))
      (is (= {:added 0 :updated 0 :removed 0} (:summary result))))))

(deftest ^:parallel duplicate-entity-id-on-one-side-throws-test
  (testing "two specs on the same side sharing an entity_id is corruption -> throw, not silently drop one"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"Duplicate serdes identity"
         (remote-sync.merge/three-way-merge
          [(card "A" "a")]
          [(card "A" "bar") (card "A" "baz")] ; same entity_id "A" at two different paths
          [(card "A" "a")]))))
  (testing "the same entity_id appearing once per side is fine (that's the normal rename/edit case)"
    (is (some? (remote-sync.merge/three-way-merge
                [(card "A" "a")]
                [(card "A" "bar")]
                [(card "A" "baz")])))))

(deftest ^:parallel conflict-label-test
  (testing "conflict-label uses the entity's name and path"
    (is (= "bar (collections/bar.yaml)"
           (remote-sync.merge/conflict-label
            {:key   [["Card" "A"]]
             :ours  (card "A" "bar")
             :theirs (card "A" "baz")}))))
  (testing "falls back to model + id when the content has no name"
    (is (= "Card A (collections/a.yaml)"
           (remote-sync.merge/conflict-label
            {:key   [["Card" "A"]]
             :ours  {:path "collections/a.yaml" :content "not-an-entity"}
             :theirs {:path "collections/a.yaml" :content "also-not"}}))))
  (testing "a path-fallback key uses the filename, not garbage from destructuring the path string"
    (is (= "collections/x.yaml"
           (remote-sync.merge/conflict-label
            {:key    [::remote-sync.merge/by-path "collections/x.yaml"]
             :ours   {:path "collections/x.yaml" :content "not-an-entity"}
             :theirs {:path "collections/x.yaml" :content "also-not"}})))))

(deftest ^:parallel force-push-casualties-deleted-test
  (testing "GHY-3917: a force push reports remote content it would discard"
    (testing "remote-only entity (added on remote, absent locally) -> deleted"
      (is (= {:deleted ["d (collections/d.yaml)"] :overwritten []}
             (remote-sync.merge/force-push-casualties
              [(card "A" "a")]            ; base
              [(card "A" "a")]            ; ours: nothing for D
              [(card "A" "a") (card "D" "d")])))) ; theirs added D
    (testing "entity dropped locally but edited on the remote -> deleted (the remote edit is lost)"
      (is (= {:deleted ["b (collections/b.yaml)"] :overwritten []}
             (remote-sync.merge/force-push-casualties
              [(card "A" "a") (card "B" "b")]
              [(card "A" "a")]                       ; ours dropped B
              [(card "A" "a") (card "B" "b" "y: 2\n")])))))) ; theirs edited B

(deftest ^:parallel force-push-casualties-overwritten-test
  (testing "GHY-3917: an entity edited on the remote and locally -> overwritten (remote edit replaced)"
    (is (= {:deleted [] :overwritten ["a (collections/a.yaml)"]}
           (remote-sync.merge/force-push-casualties
            [(card "A" "a")]
            [(card "A" "a" "x: ours\n")]
            [(card "A" "a" "x: theirs\n")])))))

(deftest ^:parallel force-push-casualties-routine-push-not-a-casualty-test
  (testing "GHY-3917: a routine push (local edit, remote untouched since base) is not a casualty"
    (is (= {:deleted [] :overwritten []}
           (remote-sync.merge/force-push-casualties
            [(card "A" "a")]
            [(card "A" "a" "x: 1\n")] ; ours edited A
            [(card "A" "a")]))))      ; theirs unchanged
  (testing "GHY-3917: remote and local converged on the same content -> nothing lost"
    (is (= {:deleted [] :overwritten []}
           (remote-sync.merge/force-push-casualties
            [(card "A" "a")]
            [(card "A" "a" "x: 1\n")]
            [(card "A" "a" "x: 1\n")]))))
  (testing "GHY-3917: a locally-added entity is not a casualty (it's not on the remote)"
    (is (= {:deleted [] :overwritten []}
           (remote-sync.merge/force-push-casualties
            [(card "A" "a")]
            [(card "A" "a") (card "C" "c")] ; ours adds C
            [(card "A" "a")])))))

(deftest ^:parallel force-push-casualties-no-base-test
  (testing "GHY-3917: with no merge base (history rewritten), every remote entity not identical to ours is a casualty"
    (testing "remote-only -> deleted; present-but-different -> overwritten; identical -> neither"
      (is (= {:deleted ["b (collections/b.yaml)"]
              :overwritten ["a (collections/a.yaml)"]}
             (remote-sync.merge/force-push-casualties
              []                                       ; no base
              [(card "A" "a" "x: ours\n") (card "C" "c")]  ; ours: edits A, has C (not on remote)
              [(card "A" "a" "x: theirs\n") (card "B" "b")])))) ; theirs: different A, remote-only B
    (testing "an entity identical on both sides is not a casualty even without a base"
      (is (= {:deleted [] :overwritten []}
             (remote-sync.merge/force-push-casualties
              []
              [(card "A" "a")]
              [(card "A" "a")]))))))
