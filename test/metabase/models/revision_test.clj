(ns ^:mb/once metabase.models.revision-test
  (:require
   [clojure.test :refer :all]
   [metabase.config :as config]
   [metabase.models.card :refer [Card]]
   [metabase.models.interface :as mi]
   [metabase.models.revision :as revision :refer [Revision]]
   [metabase.models.revision.diff :as revision.diff]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(def ^:private reverted-to
  (atom nil))

(methodical/defmethod t2/table-name ::FakedCard [_model] :report_card)
(derive ::FakedCard :metabase/model)

(defn- do-with-model-i18n-strs! [thunk]
  (with-redefs [revision.diff/model-str->i18n-str (fn [model-str]
                                                    (case model-str
                                                      "Dashboard"     (deferred-tru "Dashboard")
                                                      "Card"          (deferred-tru "Card")
                                                      "Segment"       (deferred-tru "Segment")
                                                      "Metric"        (deferred-tru "Metric")
                                                      "NonExistModel" "NonExistModel"
                                                      "FakeCard"      "FakeCard"))]
    (thunk)))

(defmethod revision/serialize-instance ::FakedCard
  [_model _id obj]
  (into {} (assoc obj :serialized true)))

(defmethod revision/revert-to-revision! ::FakedCard
  [_model _id _user-id serialized-instance]
  (reset! reverted-to (dissoc serialized-instance :serialized)))

(defmethod revision/diff-map ::FakedCard
  [_model o1 o2]
  {:o1 (when o1 (into {} o1)), :o2 (when o2 (into {} o2))})

(defmethod revision/diff-strings ::FakedCard
  [_model o1 o2]
  (when o1
    [(str "BEFORE=" (into {} o1) ",AFTER=" (into {} o2))]))

(defn- push-fake-revision! [card-id & {:keys [message] :as object}]
  (revision/push-revision!
   {:entity   ::FakedCard
    :id       card-id
    :user-id  (mt/user->id :rasta)
    :object   (dissoc object :message)
    :message  message}))

(deftest ^:parallel post-select-test
  (testing (str "make sure we call the appropriate post-select methods on `:object` when a revision comes out of the "
                "DB. This is especially important for things like Cards where we need to make sure query is "
                "normalized")
    (is (= {:model "Card", :object {:dataset_query {:type :query}}}
           (mt/derecordize
             (mi/do-after-select Revision {:model "Card", :object {:dataset_query {:type "query"}}}))))))

;;; # Default diff-* implementations

(deftest ^:parallel default-diff-str-test
  (testing (str "Check that pattern matching allows specialization and that string only reflects the keys that have "
                "changed")
    (is (= "renamed this Card from \"Tips by State\" to \"Spots by State\"."
           (u/build-sentence
             ((get-method revision/diff-strings :default)
              Card
              {:name "Tips by State", :private false}
              {:name "Spots by State", :private false}))))

    (is (= "made this Card private."
           (u/build-sentence
             ((get-method revision/diff-strings :default)
              Card
              {:name "Spots by State", :private false}
              {:name "Spots by State", :private true}))))))

(deftest ^:parallel multiple-changes-test
  (testing "Check that 2 changes are handled nicely"
    (is (= "made this Card private and renamed it from \"Tips by State\" to \"Spots by State\"."
           (u/build-sentence
             ((get-method revision/diff-strings :default)
              Card
              {:name "Tips by State", :private false}
              {:name "Spots by State", :private true})))))

  (testing "Check that several changes are handled nicely"
    (is (= "turned this to a model, made it private and renamed it from \"Tips by State\" to \"Spots by State\"."
           (u/build-sentence
             ((get-method revision/diff-strings :default)
              Card
              {:name "Tips by State", :private false, :type "question"}
              {:name "Spots by State", :private true, :type "model"}))))))

(deftest ^:parallel revision-contains-changes-that-has-havent-been-specced-test
  (testing "When revision object contains key that we don't know how to generate diff-string
           The identifier should be 'This', not 'it' "
    ;; metabase.models.revision.diff/diff-string does not know how to generate diff string for :collection_unknown_field
    ;; and it'll return nil. in that case the identifier should not be changed to "made it card public"
    (is (= (str "made this Card public.")
           (u/build-sentence
            ((get-method revision/diff-strings :default)
             Card
             {:private true :collection_unknown_field nil}
             {:private false :collection_unknown_field 1}))))))

;;; # REVISIONS + PUSH-REVISION!

(deftest new-object-no-revisions-test
  (testing "Test that a newly created Card doesn't have any revisions"
    (t2.with-temp/with-temp [Card {card-id :id}]
      (is (= []
             (revision/revisions ::FakedCard card-id))))))

(deftest add-revision-test
  (mt/with-model-cleanup [:model/Revision]
    (testing "Test that we can add a revision"
      (t2.with-temp/with-temp [Card {card-id :id}]
        (push-fake-revision! card-id, :name "Tips Created by Day", :message "yay!")
        (is (=? [(mi/instance
                  Revision
                  {:model        "FakedCard"
                   :user_id      (mt/user->id :rasta)
                   :object       (mi/instance ::FakedCard {:name "Tips Created by Day", :serialized true})
                   :is_reversion false
                   :is_creation  false
                   :message      "yay!"})]
                (for [revision (revision/revisions ::FakedCard card-id)]
                  (dissoc revision :timestamp :id :model_id))))))

    (testing "test that most_recent is correct"
      (t2.with-temp/with-temp [Card {card-id :id}]
        (doseq [i (range 3)]
          (push-fake-revision! card-id :name (format "%d Tips Created by Day" i) :message "yay!"))
       (is (=? [{:model       "FakedCard"
                 :model_id    card-id
                 :most_recent true}
                {:model       "FakedCard"
                 :model_id    card-id
                 :most_recent false}
                {:model       "FakedCard"
                 :model_id    card-id
                 :most_recent false}]
               (t2/select :model/Revision :model "FakedCard" :model_id card-id {:order-by [[:timestamp :desc] [:id :desc]]})))))))

(deftest update-revision-does-not-update-timestamp-test
  ;; Realistically this only happens on mysql and mariadb for some reasons
  ;; and we can't update revision anyway, except for when we need to change most_recent
  (t2.with-temp/with-temp [Card {card-id :id} {}]
    (let [revision (first (t2/insert-returning-instances! :model/Revision {:model       "Card"
                                                                           :user_id     (mt/user->id :crowberto)
                                                                           :model_id    card-id
                                                                           :object      {}
                                                                           :most_recent false}))]
      (t2/update! (t2/table-name :model/Revision) (:id revision) {:most_recent true})
      (is (= (:timestamp revision)
             (t2/select-one-fn :timestamp :model/Revision (:id revision)))))))

(deftest sorting-test
  (testing "Test that revisions are sorted in reverse chronological order"
    (mt/with-model-cleanup [:model/Revision]
      (t2.with-temp/with-temp [Card {card-id :id}]
        (push-fake-revision! card-id, :name "Tips Created by Day")
        (push-fake-revision! card-id, :name "Spots Created by Day")
        (testing "revision/revisions"
          (is (=? [(mi/instance
                    Revision
                    {:model        "FakedCard"
                     :user_id      (mt/user->id :rasta)
                     :object       (mi/instance ::FakedCard {:name "Spots Created by Day", :serialized true})
                     :is_reversion false
                     :is_creation  false
                     :message      nil})
                   (mi/instance
                    Revision
                    {:model        "FakedCard"
                     :user_id      (mt/user->id :rasta)
                     :object       (mi/instance ::FakedCard {:name "Tips Created by Day", :serialized true})
                     :is_reversion false
                     :is_creation  false
                     :message      nil})]
                  (->> (revision/revisions ::FakedCard card-id)
                       (map #(dissoc % :timestamp :id :model_id))))))))))

(deftest delete-old-revisions-test
  (testing "Check that old revisions get deleted"
    (mt/with-model-cleanup [:model/Revision]
      (t2.with-temp/with-temp [Card {card-id :id}]
        ;; e.g. if max-revisions is 15 then insert 16 revisions
        (dorun (doseq [i (range (inc revision/max-revisions))]
                 (push-fake-revision! card-id, :name (format "Tips Created by Day %d" i))))
        (is (= revision/max-revisions
               (count (revision/revisions ::FakedCard card-id))))))))

(deftest do-not-record-if-object-is-not-changed-test
  (mt/with-model-cleanup [:model/Revision]
    (testing "Check that we don't record a revision if the object hasn't changed"
      (mt/with-model-cleanup [:model/Revision]
        (t2.with-temp/with-temp [Card {card-id :id}]
          (let [new-revision (fn [x]
                               (push-fake-revision! card-id, :name (format "Tips Created by Day %s" x)))]
            (testing "first revision should be recorded"
              (new-revision 1)
              (is (= 1 (count (revision/revisions ::FakedCard card-id)))))

            (testing "repeatedly push reivisions with the same object shouldn't create new revision"
              (dorun (repeatedly 5 #(new-revision 1)))
              (is (= 1 (count (revision/revisions ::FakedCard card-id)))))

            (testing "push a revision with different object should create new revision"
              (new-revision 2)
              (is (= 2 (count (revision/revisions ::FakedCard card-id)))))))))

    (testing "Check that we don't record revision on dashboard if it has a filter"
      (t2.with-temp/with-temp
        [:model/Dashboard     {dash-id :id} {:parameters [{:name "Category Name"
                                                           :slug "category_name"
                                                           :id   "_CATEGORY_NAME_"
                                                           :type "category"}]}
         :model/Card          {card-id :id} {}
         :model/DashboardCard {}            {:dashboard_id       dash-id
                                             :card_id            card-id
                                             :parameter_mappings [{:parameter_id "_CATEGORY_NAME_"
                                                                   :card_id      card-id
                                                                   :target       [:dimension (mt/$ids $categories.name)]}]}]
        (let [push-revision (fn [] (revision/push-revision!
                                    {:entity :model/Dashboard
                                     :id     dash-id
                                     :user-id (mt/user->id :rasta)
                                     :object (t2/select-one :model/Dashboard dash-id)}))]
          (testing "first revision should be recorded"
            (push-revision)
            (is (= 1 (count (revision/revisions :model/Dashboard dash-id)))))
          (testing "push again without changes shouldn't record new revision"
            (push-revision)
            (is (= 1 (count (revision/revisions :model/Dashboard dash-id)))))
          (testing "now do some updates and new revision should be reocrded"
            (t2/update! :model/Dashboard :id dash-id {:name "New name"})
            (push-revision)
            (is (= 2 (count (revision/revisions :model/Dashboard dash-id))))))))))

;;; # REVISIONS+DETAILS

(deftest add-revision-details-test
  (mt/with-model-cleanup [:model/Revision]
    (testing "Test that add-revision-details properly enriches our revision objects"
      (t2.with-temp/with-temp [Card {card-id :id}]
        (push-fake-revision! card-id, :name "Initial Name")
        (push-fake-revision! card-id, :name "Modified Name")
        (is (=? {:is_creation          false
                 :is_reversion         false
                 :message              nil
                 :user                 {:id (mt/user->id :rasta), :common_name "Rasta Toucan", :first_name "Rasta", :last_name "Toucan"}
                 :diff                 {:o1 {:name "Initial Name", :serialized true}
                                        :o2 {:name "Modified Name", :serialized true}}
                 :has_multiple_changes false
                 :description          "BEFORE={:name \"Initial Name\", :serialized true},AFTER={:name \"Modified Name\", :serialized true}."}
                (let [revisions (revision/revisions ::FakedCard card-id)]
                  (assert (= 2 (count revisions)))
                  (-> (revision/add-revision-details ::FakedCard (first revisions) (last revisions))
                      (dissoc :timestamp :id :model_id)
                      mt/derecordize))))))

    (testing "test that we return a description even when there is no change between revision"
      (is (= "created a revision with no change."
             (str (:description (revision/add-revision-details ::FakedCard {:name "Apple"} {:name "Apple"}))))))

    (testing "that we return a descrtiopn when there is no previous revision"
      (is (= "modified this."
             (str (:description (revision/add-revision-details ::FakedCard {:name "Apple"} nil))))))))

(deftest revisions+details-test
  (mt/with-model-cleanup [:model/Revision]
    (testing "Check that revisions+details pulls in user info and adds description"
      (t2.with-temp/with-temp [Card {card-id :id}]
        (push-fake-revision! card-id, :name "Tips Created by Day")
        (is (=? [(mi/instance
                  Revision
                  {:is_reversion         false,
                   :is_creation          false,
                   :message              nil,
                   :user                 {:id (mt/user->id :rasta), :common_name "Rasta Toucan", :first_name "Rasta", :last_name "Toucan"},
                   :diff                 {:o1 nil
                                          :o2 {:name "Tips Created by Day", :serialized true}}
                   :has_multiple_changes false
                   :description          "modified this."})]
                (->> (revision/revisions+details ::FakedCard card-id)
                     (map #(dissoc % :timestamp :id :model_id))
                     (map #(update % :description str)))))))))

(deftest defer-to-describe-diff-test
  (mt/with-model-cleanup [:model/Revision]
    (testing "Check that revisions properly defer to describe-diff"
      (t2.with-temp/with-temp [Card {card-id :id}]
        (push-fake-revision! card-id, :name "Tips Created by Day")
        (push-fake-revision! card-id, :name "Spots Created by Day")
        (is (=? [(mi/instance
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
                (->> (revision/revisions+details ::FakedCard card-id)
                     (map #(dissoc % :timestamp :id :model_id))
                     (map #(update % :description str)))))))))

;;; # REVERT

(deftest revert-defer-to-revert-to-revision!-test
  (mt/with-model-cleanup [:model/Revision]
    (testing "Check that revert defers to revert-to-revision!"
      (t2.with-temp/with-temp [Card {card-id :id}]
        (push-fake-revision! card-id, :name "Tips Created by Day")
        (let [[{revision-id :id}] (revision/revisions ::FakedCard card-id)]
          (revision/revert! {:entity ::FakedCard, :id card-id, :user-id (mt/user->id :rasta), :revision-id revision-id})
          (is (= {:name "Tips Created by Day"}
                 @reverted-to)))))))

(deftest revert-to-revision!-default-impl-test
  (mt/with-model-cleanup [:model/Revision]
    (testing "Check default impl of revert-to-revision! just does mapply upd"
      (t2.with-temp/with-temp [Card {card-id :id} {:name "Spots Created By Day"}]
        (revision/push-revision! {:entity Card, :id card-id, :user-id (mt/user->id :rasta), :object {:name "Tips Created by Day"}})
        (revision/push-revision! {:entity Card, :id card-id, :user-id (mt/user->id :rasta), :object {:name "Spots Created by Day"}})
        (is (= "Spots Created By Day"
               (:name (t2/select-one Card :id card-id))))
        (let [[_ {old-revision-id :id}] (revision/revisions Card card-id)]
          (revision/revert! {:entity Card, :id card-id, :user-id (mt/user->id :rasta), :revision-id old-revision-id})
          (is (= "Tips Created by Day"
                 (:name (t2/select-one Card :id card-id)))))))))

(deftest reverting-should-add-revision-test
  (mt/with-model-cleanup [:model/Revision]
    (testing "Check that reverting to a previous revision adds an appropriate revision"
      (t2.with-temp/with-temp [Card {card-id :id}]
        (push-fake-revision! card-id :name "Tips Created by Day")
        (push-fake-revision! card-id :name "Spots Created by Day")
        (let [[_ {old-revision-id :id}] (revision/revisions ::FakedCard card-id)]
          (revision/revert! {:entity ::FakedCard, :id card-id, :user-id (mt/user->id :rasta), :revision-id old-revision-id})
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
               (->> (revision/revisions ::FakedCard card-id)
                    (map #(dissoc % :timestamp :id :model_id))))))))))

(deftest generic-models-revision-title+description-test
  (do-with-model-i18n-strs!
   (fn []
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
                                                 {:object       {:type "question"
                                                                 :display :table}
                                                  :is_reversion false
                                                  :is_creation  false}
                                                 {:object       {:type "model"
                                                                 :display :bar}
                                                  :is_reversion false
                                                  :is_creation  false}))

         (testing "changes contains unspecified keys will not be mentioned"
           (is (= {:description          "turned this to a model."
                   :has_multiple_changes false}
                  (#'revision/revision-description-info model
                                                        {:object       {:type        "question"
                                                                        :unknown_key false}
                                                         :is_reversion false
                                                         :is_creation  false}
                                                        {:object       {:type        "model"
                                                                        :unknown_key false}
                                                         :is_reversion false
                                                         :is_creation  false})))))))))

(deftest revision-tracks-metabase-version
  (testing "creating a new revision uses current metabase version"
    (let [new-version "just a test"]
      (t2.with-temp/with-temp [Card {card-id :id}]
        (push-fake-revision! card-id, :name "one", :message "yay!")
        (with-redefs [config/mb-version-string new-version]
          (push-fake-revision! card-id, :name "two", :message "yay!"))
        (is (=? [{:metabase_version new-version}
                 {:metabase_version config/mb-version-string}]
                (revision/revisions ::FakedCard card-id)))))))
