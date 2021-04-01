(ns metabase.models.revision-test
  (:require [clojure.test :refer :all]
            [metabase.models.card :refer [Card]]
            [metabase.models.revision :as revision]
            [metabase.test :as mt]
            [toucan.models :as models]))

(def ^:private reverted-to
  (atom nil))

(models/defmodel ^:private FakedCard :report_card)

(extend-type (class FakedCard)
  revision/IRevisioned
  (serialize-instance [_ _ obj]
    (assoc obj :serialized true))
  (revert-to-revision! [_ _ _ serialized-instance]
    (reset! reverted-to (dissoc serialized-instance :serialized)))
  (diff-map [_ o1 o2]
    {:o1 o1, :o2 o2})
  (diff-str [_ o1 o2]
    (when o1
      (str "BEFORE=" o1 ",AFTER=" o2))))

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
            (#'revision/do-post-select-for-object {:model "Card", :object {:dataset_query {:type "query"}}})))))


;;; # Default diff-* implementations

  (deftest default-diff-str-test
    (testing (str "Check that pattern matching allows specialization and that string only reflects the keys that have "
                  "changed")
      (is (= "renamed this Card from \"Tips by State\" to \"Spots by State\"."
             (revision/default-diff-str Card
                                        {:name "Tips by State", :private false}
                                        {:name "Spots by State", :private false})))

      (is (= "made this Card private."
             (revision/default-diff-str Card
                                        {:name "Spots by State", :private false}
                                        {:name "Spots by State", :private true}))))))

(deftest fallback-description-test
  (testing "Check the fallback sentence fragment for key without specialized sentence fragment"
    (is (= "changed priority from \"Important\" to \"Regular\"."
           (revision/default-diff-str Card
                                      {:priority "Important"}
                                      {:priority "Regular"})))))

(deftest multiple-changes-test
  (testing "Check that 2 changes are handled nicely"
    (is (= "made this Card private and renamed it from \"Tips by State\" to \"Spots by State\"."
           (revision/default-diff-str Card
                                      {:name "Tips by State", :private false}
                                      {:name "Spots by State", :private true}))))

  (testing "Check that several changes are handled nicely"
    (is (= (str "changed priority from \"Important\" to \"Regular\", made this Card private and renamed it from "
                "\"Tips by State\" to \"Spots by State\".")
           (revision/default-diff-str Card
                                      {:name "Tips by State", :private false, :priority "Important"}
                                      {:name "Spots by State", :private true, :priority "Regular"})))))

;;; # REVISIONS + PUSH-REVISION!

(deftest new-object-no-revisions-test
  (testing "Test that a newly created Card doesn't have any revisions"
    (mt/with-temp Card [{card-id :id}]
      (is (= []
             (revision/revisions FakedCard card-id))))))

(deftest add-revision-test
  (testing "Test that we can add a revision"
    (mt/with-temp Card [{card-id :id}]
      (push-fake-revision! card-id, :name "Tips Created by Day", :message "yay!")
      (is (= [(revision/map->RevisionInstance
               {:model        "FakedCard"
                :user_id      (mt/user->id :rasta)
                :object       {:name "Tips Created by Day", :serialized true}
                :is_reversion false
                :is_creation  false
                :message      "yay!"})]
             (for [revision (revision/revisions FakedCard card-id)]
               (dissoc revision :timestamp :id :model_id)))))))

(deftest sorting-test
  (testing "Test that revisions are sorted in reverse chronological order"
    (mt/with-temp Card [{card-id :id}]
      (push-fake-revision! card-id, :name "Tips Created by Day")
      (push-fake-revision! card-id, :name "Spots Created by Day")
      (is (= [(revision/map->RevisionInstance
               {:model        "FakedCard"
                :user_id      (mt/user->id :rasta)
                :object       {:name "Spots Created by Day", :serialized true}
                :is_reversion false
                :is_creation  false
                :message      nil})
              (revision/map->RevisionInstance
               {:model        "FakedCard"
                :user_id      (mt/user->id :rasta)
                :object       {:name "Tips Created by Day", :serialized true}
                :is_reversion false
                :is_creation  false
                :message      nil})]
             (->> (revision/revisions FakedCard card-id)
                  (map #(dissoc % :timestamp :id :model_id))))))))

(deftest delete-old-revisions-test
  (testing "Check that old revisions get deleted"
    (mt/with-temp Card [{card-id :id}]
      ;; e.g. if max-revisions is 15 then insert 16 revisions
      (dorun (repeatedly (inc revision/max-revisions) #(push-fake-revision! card-id, :name "Tips Created by Day")))
      (is (= revision/max-revisions
             (count (revision/revisions FakedCard card-id)))))))


;;; # REVISIONS+DETAILS

(deftest add-revision-details-test
  (testing "Test that add-revision-details properly enriches our revision objects"
    (mt/with-temp Card [{card-id :id}]
      (push-fake-revision! card-id, :name "Initial Name")
      (push-fake-revision! card-id, :name "Modified Name")
      (is (= {:is_creation  false
              :is_reversion false
              :message      nil
              :user         {:id (mt/user->id :rasta), :common_name "Rasta Toucan", :first_name "Rasta", :last_name "Toucan"}
              :diff         {:o1 {:name "Initial Name", :serialized true}
                             :o2 {:name "Modified Name", :serialized true}}
              :description  "BEFORE={:name \"Initial Name\", :serialized true},AFTER={:name \"Modified Name\", :serialized true}"}
             (let [revisions (revision/revisions FakedCard card-id)]
               (assert (= 2 (count revisions)))
               (-> (revision/add-revision-details FakedCard (first revisions) (last revisions))
                   (dissoc :timestamp :id :model_id)
                   mt/derecordize)))))))

(deftest revisions+details-test
  (testing "Check that revisions+details pulls in user info and adds description"
    (mt/with-temp Card [{card-id :id}]
      (push-fake-revision! card-id, :name "Tips Created by Day")
      (is (= [(revision/map->RevisionInstance
               {:is_reversion false,
                :is_creation  false,
                :message      nil,
                :user         {:id (mt/user->id :rasta), :common_name "Rasta Toucan", :first_name "Rasta", :last_name "Toucan"},
                :diff         {:o1 nil
                               :o2 {:name "Tips Created by Day", :serialized true}}
                :description  nil})]
             (->> (revision/revisions+details FakedCard card-id)
                  (map #(dissoc % :timestamp :id :model_id))))))))

(deftest defer-to-describe-diff-test
  (testing "Check that revisions properly defer to describe-diff"
    (mt/with-temp Card [{card-id :id}]
      (push-fake-revision! card-id, :name "Tips Created by Day")
      (push-fake-revision! card-id, :name "Spots Created by Day")
      (is (= [(revision/map->RevisionInstance
               {:is_reversion false,
                :is_creation  false,
                :message      nil
                :user         {:id (mt/user->id :rasta), :common_name "Rasta Toucan", :first_name "Rasta", :last_name "Toucan"},
                :diff         {:o1 {:name "Tips Created by Day", :serialized true}
                               :o2 {:name "Spots Created by Day", :serialized true}}
                :description  (str "BEFORE={:name \"Tips Created by Day\", :serialized true},AFTER="
                                   "{:name \"Spots Created by Day\", :serialized true}")})
              (revision/map->RevisionInstance
               {:is_reversion false,
                :is_creation  false,
                :message      nil
                :user         {:id (mt/user->id :rasta), :common_name "Rasta Toucan", :first_name "Rasta", :last_name "Toucan"},
                :diff         {:o1 nil
                               :o2 {:name "Tips Created by Day", :serialized true}}
                :description  nil})]
             (->> (revision/revisions+details FakedCard card-id)
                  (map #(dissoc % :timestamp :id :model_id))))))))

;;; # REVERT

(deftest revert-defer-to-revert-to-revision!-test
  (testing "Check that revert defers to revert-to-revision!"
    (mt/with-temp Card [{card-id :id}]
      (push-fake-revision! card-id, :name "Tips Created by Day")
      (let [[{revision-id :id}] (revision/revisions FakedCard card-id)]
        (revision/revert! :entity FakedCard, :id card-id, :user-id (mt/user->id :rasta), :revision-id revision-id)
        (is (= {:name "Tips Created by Day"}
               @reverted-to))))))

(deftest revert-to-revision!-default-impl-test
  (testing "Check default impl of revert-to-revision! just does mapply upd"
    (mt/with-temp Card [{card-id :id} {:name "Spots Created By Day"}]
      (revision/push-revision! :entity Card, :id card-id, :user-id (mt/user->id :rasta), :object {:name "Tips Created by Day"})
      (revision/push-revision! :entity Card, :id card-id, :user-id (mt/user->id :rasta), :object {:name "Spots Created by Day"})
      (is (= "Spots Created By Day"
             (:name (Card card-id))))
      (let [[_ {old-revision-id :id}] (revision/revisions Card card-id)]
        (revision/revert! :entity Card, :id card-id, :user-id (mt/user->id :rasta), :revision-id old-revision-id)
        (is (= "Tips Created by Day"
               (:name (Card card-id))))))))

(deftest reverting-should-add-revision-test
  (testing "Check that reverting to a previous revision adds an appropriate revision"
    (mt/with-temp Card [{card-id :id}]
      (push-fake-revision! card-id, :name "Tips Created by Day")
      (push-fake-revision! card-id, :name "Spots Created by Day")
      (let [[_ {old-revision-id :id}] (revision/revisions FakedCard card-id)]
        (revision/revert! :entity FakedCard, :id card-id, :user-id (mt/user->id :rasta), :revision-id old-revision-id)
        (is (= [(revision/map->RevisionInstance
                 {:model        "FakedCard"
                  :user_id      (mt/user->id :rasta)
                  :object       {:name "Tips Created by Day", :serialized true}
                  :is_reversion true
                  :is_creation  false
                  :message      nil})
                (revision/map->RevisionInstance
                 {:model        "FakedCard",
                  :user_id      (mt/user->id :rasta)
                  :object       {:name "Spots Created by Day", :serialized true}
                  :is_reversion false
                  :is_creation  false
                  :message      nil})
                (revision/map->RevisionInstance
                 {:model        "FakedCard",
                  :user_id      (mt/user->id :rasta)
                  :object       {:name "Tips Created by Day", :serialized true}
                  :is_reversion false
                  :is_creation  false
                  :message      nil})]
               (->> (revision/revisions FakedCard card-id)
                    (map #(dissoc % :timestamp :id :model_id)))))))))
