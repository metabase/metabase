(ns metabase-enterprise.library-branching.instance.glossary-test
  "The app DB side of glossary terms: the content that the instance reads, `write!`, `current` and `trash!`, their
  laws, and the scenarios of the remote-sync glossary tests in library-branching form. Each test writes in a
  transaction that rolls back."
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.engine.diff :as diff]
   [metabase-enterprise.library-branching.format.kinds :as format.kinds]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.instance.write-test :as write-test]
   [metabase.config.core :as config]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; The tests open their own transactions, and the app DB must not be set up inside one.
(use-fixtures :once (fixtures/initialize :db :test-users))

;;; ---------------------------------------------------- Helpers ---------------------------------------------------

(defn- store [] (get app-db/kind-stores :glossary-term))

(defn- term-item
  "The content of a glossary term."
  [term definition]
  {:kind :glossary-term :name term :place "glossaryglossarygloss" :refs #{} :attrs {:definition definition}})

(defn- write! [id item] (instance/write! (store) id item))

(defn- current [id] (instance/current (store) id))

(defn- trash! [id] (instance/trash! (store) id))

(defn- insert-term!
  "Inserts a glossary term as a person's save does, and returns its row."
  [term definition & {:as more}]
  (t2/insert-returning-instance! :model/Glossary (merge {:term       term
                                                         :definition definition
                                                         :creator_id (mt/user->id :rasta)}
                                                        more)))

(defn- term-rows
  "Every column of the glossary rows of the identities `ids`."
  [ids]
  (t2/select :glossary :entity_id [:in ids] {:order-by [:id]}))

(def ^:private churn-id "lbGlossaryChurn000001")
(def ^:private other-id "lbGlossaryOther000001")

(def ^:private none {:created #{} :deleted #{} :updated #{}})

;;; ---------------------------------------------------- Content ---------------------------------------------------

(deftest glossary-content-test
  (testing "a glossary term: its term as the name, the glossary area root as the place, no references, and its definition"
    (t2/with-transaction [_ nil {:rollback-only true}]
      (let [row (insert-term! "lb churn" "The share of customers who cancel.")]
        (is (= (term-item "lb churn" "The share of customers who cancel.")
               (get (app-db/read-current) (:entity_id row))))
        (testing "the creator and the time stamps are not content"
          (t2/update! :glossary (:id row) {:creator_id (mt/user->id :crowberto)
                                           :created_at (java.time.OffsetDateTime/parse "2020-01-01T00:00:00Z")})
          (is (= (term-item "lb churn" "The share of customers who cancel.")
                 (get (app-db/read-current) (:entity_id row)))))))))

(deftest local-changes-test
  (t2/with-transaction [_ nil {:rollback-only true}]
    (let [pushed (insert-term! "lb pushed" "Pushed definition.")
          base   (app-db/read-current)
          local  #(diff/diff base (app-db/read-current))]
      (testing "a save of the same term and definition leaves the term synced"
        (t2/update! :model/Glossary (:id pushed) {:term "lb pushed" :definition "Pushed definition."})
        (is (= none (local))))
      (testing "a new glossary term is a local create"
        (let [new-term (insert-term! "lb new" "New.")]
          (is (= (assoc none :created #{(:entity_id new-term)}) (local)))
          (testing "and its delete leaves no change: it is in neither the base nor the instance"
            (t2/delete! :model/Glossary :id (:id new-term))
            (is (= none (local))))))
      (testing "a change of the definition, or of the term, is a local update; the change back is no change"
        (t2/update! :model/Glossary (:id pushed) {:definition "Changed."})
        (is (= (assoc none :updated #{(:entity_id pushed)}) (local)))
        (t2/update! :model/Glossary (:id pushed) {:definition "Pushed definition." :term "lb renamed"})
        (is (= (assoc none :updated #{(:entity_id pushed)}) (local)))
        (t2/update! :model/Glossary (:id pushed) {:term "lb pushed"})
        (is (= none (local))))
      (testing "the delete of a pushed term is a local delete"
        (t2/with-transaction [_ nil {:rollback-only true}]
          (t2/delete! :model/Glossary :id (:id pushed))
          (is (= (assoc none :deleted #{(:entity_id pushed)}) (local)))))
      (testing "with no base, every glossary term is a local create, so the first push carries every term"
        (let [other (insert-term! "lb other" "Other.")]
          (is (every? (:created (diff/diff {} (app-db/read-current))) [(:entity_id pushed) (:entity_id other)])))))))

;;; ----------------------------------------------------- Writes ----------------------------------------------------

(deftest write-test
  (t2/with-transaction [_ nil {:rollback-only true}]
    (let [item (term-item "lb written" "From the head.")]
      (testing "a write of a new identity creates the term, and current returns the content"
        (is (nil? (current churn-id)))
        (write! churn-id item)
        (is (= item (current churn-id)))
        (is (= {:term "lb written" :definition "From the head." :creator_id config/internal-mb-user-id}
               (t2/select-one [:model/Glossary :term :definition :creator_id] :entity_id churn-id))))
      (let [id (t2/select-one-pk :model/Glossary :entity_id churn-id)]
        (testing "a write of a changed definition changes it in place"
          (write! churn-id (term-item "lb written" "A new definition."))
          (is (= (term-item "lb written" "A new definition.") (current churn-id)))
          (is (= id (t2/select-one-pk :model/Glossary :entity_id churn-id))))
        (testing "a write of another term renames the same row"
          (write! churn-id (term-item "lb renamed" "A new definition."))
          (is (= (term-item "lb renamed" "A new definition.") (current churn-id)))
          (is (= [id] (map :id (term-rows [churn-id])))))
        (testing "an empty definition is content"
          (write! churn-id (term-item "lb renamed" ""))
          (is (= (term-item "lb renamed" "") (current churn-id))))))))

(deftest write-of-current-content-changes-no-row-test
  (testing "GetPut: a write of the current content changes no row, not even a time stamp, also after a pull wrote it"
    (t2/with-transaction [_ nil {:rollback-only true}]
      (let [saved (insert-term! "lb getput" "Saved by a person.")]
        (write! other-id (term-item "lb pulled" "Written by a pull."))
        (let [ids    [(:entity_id saved) other-id]
              before (term-rows ids)]
          (doseq [id ids]
            (write! id (current id)))
          (is (= before (term-rows ids)))
          (is (= (term-item "lb pulled" "Written by a pull.") (current other-id))))))))

(deftest write-keeps-instance-local-attributes-test
  (testing "a write never changes the creator or the time of creation"
    (t2/with-transaction [_ nil {:rollback-only true}]
      (let [row    (insert-term! "lb local" "Before." :creator_id (mt/user->id :rasta))
            local  #(t2/select-one [:glossary :creator_id :created_at] (:id row))
            before (local)]
        (mt/with-current-user (mt/user->id :crowberto)
          (write! (:entity_id row) (term-item "lb local, renamed" "After.")))
        (is (= (term-item "lb local, renamed" "After.") (current (:entity_id row))))
        (is (= before (local)))))))

(deftest name-taken-test
  (testing "a write with a term that a glossary term of another identity has is refused, and writes nothing"
    (t2/with-transaction [_ nil {:rollback-only true}]
      (let [local  (insert-term! "lb ARR" "Annual recurring revenue, as we count it.")
            before (term-rows [(:entity_id local) churn-id])]
        (is (= :name-taken (write-test/refusal #(write! churn-id (term-item "lb ARR" "As the head counts it.")))))
        (is (= before (term-rows [(:entity_id local) churn-id])))
        (testing "the term of the same identity is no clash"
          (write! (:entity_id local) (term-item "lb ARR" "As the head counts it."))
          (is (= (term-item "lb ARR" "As the head counts it.") (current (:entity_id local)))))
        (testing "a rename to a free term applies"
          (write! churn-id (term-item "lb ARR, head" "As the head counts it."))
          (is (= (term-item "lb ARR, head" "As the head counts it.") (current churn-id))))
        (testing "a rename of the other identity to the taken term is refused"
          (is (= :name-taken (write-test/refusal #(write! churn-id (term-item "lb ARR" "x")))))
          (is (= (term-item "lb ARR, head" "As the head counts it.") (current churn-id))))))))

(deftest refused-writes-write-nothing-test
  (testing "content that is not a glossary term is refused, and nothing is written"
    (t2/with-transaction [_ nil {:rollback-only true}]
      (let [item (term-item "lb refused" "Some text.")]
        (doseq [[label bad] [["another kind" (assoc item :kind :snippet)]
                             ["no definition" (assoc item :attrs {})]
                             ["another place" (assoc item :place "lbNoSuchCollection001")]
                             ["no place" (assoc item :place nil)]
                             ["another area root" (assoc item :place "snippetssnippetssnipp")]
                             ["a reference" (assoc item :refs #{[:card "IW8kbqZVaMxdGtCM2F4U6"]})]
                             ["an instance-local attribute" (assoc-in item [:attrs :creator_id] 1)]
                             ["a term of 256 characters" (assoc item :name (apply str (repeat 256 "x")))]]]
          (testing label
            (is (= :invalid-content (write-test/refusal #(write! churn-id bad))))
            (is (nil? (t2/select-one :model/Glossary :entity_id churn-id)))))))))

;;; ----------------------------------------------------- Trash ----------------------------------------------------

(deftest trash-test
  (testing "Metabase has no trash for glossary terms, so trash! deletes the term"
    (t2/with-transaction [_ nil {:rollback-only true}]
      (let [row (insert-term! "lb trashed" "Gone soon.")
            id  (:entity_id row)]
        (is (= (term-item "lb trashed" "Gone soon.") (current id)))
        (trash! id)
        (is (nil? (current id)))
        (is (not (contains? (app-db/read-current) id)))
        (is (not (t2/exists? :model/Glossary :entity_id id)))
        (testing "a trash of an identity that no row has does nothing"
          (is (nil? (trash! id)))
          (is (nil? (trash! "lbNoSuchGlossaryTerm1"))))
        (testing "a later write of the identity makes the term again, with the same identity"
          (write! id (term-item "lb trashed" "Back again."))
          (is (= (term-item "lb trashed" "Back again.") (current id))))))))

;;; ----------------------------------------------------- Laws -----------------------------------------------------

(def ^:private terms
  "Terms that the generated items take: two of them differ only in case, and one has characters that YAML quotes."
  ["lb gen churn" "lb gen Churn" "lb gen: retention" "lb gen Société"])

(def ^:private definitions
  ["Who leaves." "" "line one\nline two\n" "null" "{{x}} and [link](card:1)"])

(def ^:private item-gen
  (gen/let [term       (gen/elements terms)
            definition (gen/elements definitions)]
    (term-item term definition)))

(defn- laws-hold!
  "True iff each write of `items` to one identity reads back with current (PutGet), and a write of the content that
  current then returns changes no row (GetPut). Writes in a transaction that rolls back."
  [items]
  (t2/with-transaction [_ nil {:rollback-only true}]
    (let [put-get (every? (fn [item]
                            (write! churn-id item)
                            (= item (current churn-id)))
                          items)
          before  (term-rows [churn-id])]
      (write! churn-id (current churn-id))
      (and put-get (= before (term-rows [churn-id]))))))

(defspec glossary-laws-test 50
  (prop/for-all [items (gen/vector item-gen 1 4)]
    (laws-hold! items)))

(deftest read-all-after-write-test
  (testing "read-all of the identities of a written snapshot of glossary terms returns that snapshot"
    (t2/with-transaction [_ nil {:rollback-only true}]
      (let [s {churn-id (term-item "lb snapshot one" "One.")
               other-id (term-item "lb snapshot two" "Two.")}]
        (doseq [[id item] s]
          (write! id item))
        (is (= s (instance/read-all (store) (keys s))))
        (is (= s (select-keys (app-db/read-current) (keys s))))
        (is (= #{} (:refs (get s churn-id)) (format.kinds/refs :glossary-term churn-id (:attrs (get s churn-id)))))))))
