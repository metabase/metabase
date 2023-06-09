(ns metabase.models.revision-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.card :refer [Card]]
   [metabase.models.interface :as mi]
   [metabase.models.revision :as revision :refer [Revision]]
   [metabase.models.revision.diff :refer [build-sentence]]
   [metabase.test :as mt]
   [metabase.util.i18n :refer [deferred-tru]]
   [toucan.models :as models]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(def ^:private reverted-to
  (atom nil))

(models/defmodel ^:private FakedCard :report_card)

(use-fixtures :each (fn [thunk]
                      (with-redefs [metabase.models.revision.diff/model-str->i18n-str (fn [model-str]
                                                                                        (case model-str
                                                                                          "Dashboard"     (deferred-tru "Dashboard")
                                                                                          "Card"          (deferred-tru "Card")
                                                                                          "Segment"       (deferred-tru "Segment")
                                                                                          "Metric"        (deferred-tru "Metric")
                                                                                          "NonExistModel" "NonExistModel"
                                                                                          "FakeCard"      "FakeCard"))]
                        (thunk))))

(defmethod revision/serialize-instance FakedCard
  [_model _id obj]
  (into {} (assoc obj :serialized true)))

(defmethod revision/revert-to-revision! FakedCard
  [_model _id _user-id serialized-instance]
  (reset! reverted-to (dissoc serialized-instance :serialized)))

(defmethod revision/diff-map FakedCard
  [_model o1 o2]
  {:o1 (when o1 (into {} o1)), :o2 (when o2 (into {} o2))})

(defmethod revision/diff-strings FakedCard
  [_model o1 o2]
  (when o1
    [(str "BEFORE=" (into {} o1) ",AFTER=" (into {} o2))]))

(defn- push-fake-revision! [card-id & {:keys [message] :as object}]
  (revision/push-revision!
    :entity   FakedCard
    :id       card-id
    :user-id  (mt/user->id :rasta)
    :object   (dissoc object :message)
    :message  message))

(deftest post-select-test
  (testing (str "make sure we call the appropriate post-select methods on `:object` when a revision comes out of the "
                "DB. This is especially important for things like Cards where we need to make sure query is "
                "normalized")
    (is (= {:model "Card", :object {:dataset_query {:type :query}}}
           (mt/derecordize
             (models/do-post-select Revision {:model "Card", :object {:dataset_query {:type "query"}}}))))))

;;; # Default diff-* implementations

(deftest default-diff-str-test
  (testing (str "Check that pattern matching allows specialization and that string only reflects the keys that have "
                "changed")
    (is (= "renamed this Card from \"Tips by State\" to \"Spots by State\"."
           (build-sentence
             ((get-method revision/diff-strings :default)
              Card
              {:name "Tips by State", :private false}
              {:name "Spots by State", :private false}))))

    (is (= "made this Card private."
           (build-sentence
             ((get-method revision/diff-strings :default)
              Card
              {:name "Spots by State", :private false}
              {:name "Spots by State", :private true}))))))

(deftest multiple-changes-test
  (testing "Check that 2 changes are handled nicely"
    (is (= "made this Card private and renamed it from \"Tips by State\" to \"Spots by State\"."
           (build-sentence
             ((get-method revision/diff-strings :default)
              Card
              {:name "Tips by State", :private false}
              {:name "Spots by State", :private true})))))

  (testing "Check that several changes are handled nicely"
    (is (= (str "turned this into a model, made it private and renamed it from \"Tips by State\" to \"Spots by State\".")
           (build-sentence
             ((get-method revision/diff-strings :default)
              Card
              {:name "Tips by State", :private false, :dataset false}
              {:name "Spots by State", :private true, :dataset true}))))))

;;; # REVISIONS + PUSH-REVISION!

(deftest new-object-no-revisions-test
  (testing "Test that a newly created Card doesn't have any revisions"
    (t2.with-temp/with-temp [Card {card-id :id}]
      (is (= []
             (revision/revisions FakedCard card-id))))))

(deftest add-revision-test
  (testing "Test that we can add a revision"
    (t2.with-temp/with-temp [Card {card-id :id}]
      (push-fake-revision! card-id, :name "Tips Created by Day", :message "yay!")
      (is (= [(mi/instance
               Revision
               {:model        "FakedCard"
                :user_id      (mt/user->id :rasta)
                :object       (mi/instance FakedCard {:name "Tips Created by Day", :serialized true})
                :is_reversion false
                :is_creation  false
                :message      "yay!"})]
             (for [revision (revision/revisions FakedCard card-id)]
               (dissoc revision :timestamp :id :model_id)))))))

(deftest sorting-test
  (testing "Test that revisions are sorted in reverse chronological order"
    (t2.with-temp/with-temp [Card {card-id :id}]
      (push-fake-revision! card-id, :name "Tips Created by Day")
      (push-fake-revision! card-id, :name "Spots Created by Day")
      (is (= [(mi/instance
               Revision
               {:model        "FakedCard"
                :user_id      (mt/user->id :rasta)
                :object       (mi/instance FakedCard {:name "Spots Created by Day", :serialized true})
                :is_reversion false
                :is_creation  false
                :message      nil})
              (mi/instance
               Revision
               {:model        "FakedCard"
                :user_id      (mt/user->id :rasta)
                :object       (mi/instance FakedCard {:name "Tips Created by Day", :serialized true})
                :is_reversion false
                :is_creation  false
                :message      nil})]
             (->> (revision/revisions FakedCard card-id)
                  (map #(dissoc % :timestamp :id :model_id))))))))

(deftest delete-old-revisions-test
  (testing "Check that old revisions get deleted"
    (t2.with-temp/with-temp [Card {card-id :id}]
      ;; e.g. if max-revisions is 15 then insert 16 revisions
      (dorun (doseq [i (range (inc revision/max-revisions))]
               (push-fake-revision! card-id, :name (format "Tips Created by Day %d" i))))
      (is (= revision/max-revisions
             (count (revision/revisions FakedCard card-id)))))))

(deftest do-not-record-if-object-is-not-changed-test
  (testing "Check that we don't record a revision if the object hasn't changed"
    (t2.with-temp/with-temp [Card {card-id :id}]
      (let [new-revision (fn [x]
                           (push-fake-revision! card-id, :name (format "Tips Created by Day %s" x)))]
        (testing "first revision should be recorded"
          (new-revision 1)
          (is (= 1 (count (revision/revisions FakedCard card-id)))))

        (testing "repeatedly push reivisions with thesame object shouldn't create new revision"
          (dorun (repeatedly 5 #(new-revision 1)))
          (is (= 1 (count (revision/revisions FakedCard card-id)))))

        (testing "push a revision with different object should create new revision"
          (new-revision 2)
          (is (= 2 (count (revision/revisions FakedCard card-id)))))))))

;;; # REVISIONS+DETAILS

(deftest add-revision-details-test
  (testing "Test that add-revision-details properly enriches our revision objects"
    (t2.with-temp/with-temp [Card {card-id :id}]
      (push-fake-revision! card-id, :name "Initial Name")
      (push-fake-revision! card-id, :name "Modified Name")
      (is (= {:is_creation          false
              :is_reversion         false
              :message              nil
              :user                 {:id (mt/user->id :rasta), :common_name "Rasta Toucan", :first_name "Rasta", :last_name "Toucan"}
              :diff                 {:o1 {:name "Initial Name", :serialized true}
                                     :o2 {:name "Modified Name", :serialized true}}
              :has_multiple_changes false
              :description          "BEFORE={:name \"Initial Name\", :serialized true},AFTER={:name \"Modified Name\", :serialized true}."}
             (let [revisions (revision/revisions FakedCard card-id)]
               (assert (= 2 (count revisions)))
               (-> (revision/add-revision-details FakedCard (first revisions) (last revisions))
                   (dissoc :timestamp :id :model_id)
                   mt/derecordize))))))

  (testing "test that we return a description even when there is no change between revision"
    (is (= "created a revision with no change."
           (str (:description (revision/add-revision-details FakedCard {:name "Apple"} {:name "Apple"}))))))

  (testing "that we return a descrtiopn when there is no previous revision"
    (is (= "modified this."
           (str (:description (revision/add-revision-details FakedCard {:name "Apple"} nil)))))))

(deftest revisions+details-test
  (testing "Check that revisions+details pulls in user info and adds description"
    (t2.with-temp/with-temp [Card {card-id :id}]
      (push-fake-revision! card-id, :name "Tips Created by Day")
      (is (= [(mi/instance
               Revision
               {:is_reversion         false,
                :is_creation          false,
                :message              nil,
                :user                 {:id (mt/user->id :rasta), :common_name "Rasta Toucan", :first_name "Rasta", :last_name "Toucan"},
                :diff                 {:o1 nil
                                       :o2 {:name "Tips Created by Day", :serialized true}}
                :has_multiple_changes false
                :description          "modified this."})]
             (->> (revision/revisions+details FakedCard card-id)
                  (map #(dissoc % :timestamp :id :model_id))
                  (map #(update % :description str))))))))

(deftest defer-to-describe-diff-test
  (testing "Check that revisions properly defer to describe-diff"
    (t2.with-temp/with-temp [Card {card-id :id}]
      (push-fake-revision! card-id, :name "Tips Created by Day")
      (push-fake-revision! card-id, :name "Spots Created by Day")
      (is (= [(mi/instance
               Revision
               {:is_reversion         false,
                :is_creation          false,
                :message              nil
                :user                 {:id (mt/user->id :rasta), :common_name "Rasta Toucan", :first_name "Rasta", :last_name "Toucan"},
                :diff                 {:o1 {:name "Tips Created by Day", :serialized true}
                                       :o2 {:name "Spots Created by Day", :serialized true}}
                :has_multiple_changes false
                :description          (str "BEFORE={:name \"Tips Created by Day\", :serialized true},AFTER="
                                           "{:name \"Spots Created by Day\", :serialized true}.")})
              (mi/instance
               Revision
               {:is_reversion         false,
                :is_creation          false,
                :message              nil
                :user                 {:id (mt/user->id :rasta), :common_name "Rasta Toucan", :first_name "Rasta", :last_name "Toucan"},
                :diff                 {:o1 nil
                                       :o2 {:name "Tips Created by Day", :serialized true}}
                :has_multiple_changes false
                :description          "modified this."})]
             (->> (revision/revisions+details FakedCard card-id)
                  (map #(dissoc % :timestamp :id :model_id))
                  (map #(update % :description str))))))))

;;; # REVERT

(deftest revert-defer-to-revert-to-revision!-test
  (testing "Check that revert defers to revert-to-revision!"
    (t2.with-temp/with-temp [Card {card-id :id}]
      (push-fake-revision! card-id, :name "Tips Created by Day")
      (let [[{revision-id :id}] (revision/revisions FakedCard card-id)]
        (revision/revert! :entity FakedCard, :id card-id, :user-id (mt/user->id :rasta), :revision-id revision-id)
        (is (= {:name "Tips Created by Day"}
               @reverted-to))))))

(deftest revert-to-revision!-default-impl-test
  (testing "Check default impl of revert-to-revision! just does mapply upd"
    (t2.with-temp/with-temp [Card {card-id :id} {:name "Spots Created By Day"}]
      (revision/push-revision! :entity Card, :id card-id, :user-id (mt/user->id :rasta), :object {:name "Tips Created by Day"})
      (revision/push-revision! :entity Card, :id card-id, :user-id (mt/user->id :rasta), :object {:name "Spots Created by Day"})
      (is (= "Spots Created By Day"
             (:name (t2/select-one Card :id card-id))))
      (let [[_ {old-revision-id :id}] (revision/revisions Card card-id)]
        (revision/revert! :entity Card, :id card-id, :user-id (mt/user->id :rasta), :revision-id old-revision-id)
        (is (= "Tips Created by Day"
               (:name (t2/select-one Card :id card-id))))))))

(deftest reverting-should-add-revision-test
  (testing "Check that reverting to a previous revision adds an appropriate revision"
    (t2.with-temp/with-temp [Card {card-id :id}]
      (push-fake-revision! card-id, :name "Tips Created by Day")
      (push-fake-revision! card-id, :name "Spots Created by Day")
      (let [[_ {old-revision-id :id}] (revision/revisions FakedCard card-id)]
        (revision/revert! :entity FakedCard, :id card-id, :user-id (mt/user->id :rasta), :revision-id old-revision-id)
        (is (partial=
             [(mi/instance
               Revision
               {:model        "FakedCard"
                :user_id      (mt/user->id :rasta)
                :object       {:name "Tips Created by Day", :serialized true}
                :is_reversion true
                :is_creation  false
                :message      nil})
              (mi/instance
               Revision
               {:model        "FakedCard",
                :user_id      (mt/user->id :rasta)
                :object       {:name "Spots Created by Day", :serialized true}
                :is_reversion false
                :is_creation  false
                :message      nil})
              (mi/instance
               Revision
               {:model        "FakedCard",
                :user_id      (mt/user->id :rasta)
                :object       {:name "Tips Created by Day", :serialized true}
                :is_reversion false
                :is_creation  false
                :message      nil})]
             (->> (revision/revisions FakedCard card-id)
                  (map #(dissoc % :timestamp :id :model_id)))))))))

(deftest generic-models-revision-title+description-test
  (doseq [model ["NonExistModel" "Card" "Dashboard"]]
   (testing (format "revision for %s models" (if (nil? model) "generic" model))
     (testing "creation"
       (is (= {:has_multiple_changes false
               :description          "created this."}
              (#'revision/revision-description-info model
                                                     nil
                                                     {:object       {:name "New Object"}
                                                      :is_reversion false
                                                      :is_creation  true}))))

     (testing "reversion"
       (is (= {:has_multiple_changes false
               :description          "reverted to an earlier version."}
              (#'revision/revision-description-info model
                                                     {:object       {:name "New Object"}
                                                      :is_reversion false
                                                      :is_creation  false}
                                                     {:object       {:name "New Object"}
                                                      :is_reversion true
                                                      :is_creation  false}))))

     (testing "multiple changes"
       {:description          "changed the display from table to bar and turned this into a model."
        :has_multiple_changes true}
       (#'revision/revision-description-info model
                                              {:object       {:dataset false
                                                              :display :table}
                                               :is_reversion false
                                               :is_creation  false}
                                              {:object       {:dataset true
                                                              :display :bar}
                                               :is_reversion false
                                               :is_creation  false}))

     (testing "changes contains unspecified keys will not be mentioned"
       (is (= {:description          "turned this into a model."
               :has_multiple_changes false}
              (#'revision/revision-description-info model
                                                     {:object       {:dataset     false
                                                                     :unknown_key false}
                                                      :is_reversion false
                                                      :is_creation  false}
                                                     {:object       {:dataset     true
                                                                     :unknown_key false}
                                                      :is_reversion false
                                                      :is_creation  false})))))))
