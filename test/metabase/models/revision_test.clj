(ns metabase.models.revision-test
  (:require [expectations :refer :all]
            [metabase.models
             [card :refer [Card]]
             [revision :refer :all :as revision]]
            [metabase.test.data.users :refer :all]
            [metabase.util :as u]
            [toucan.models :as models]
            [toucan.util.test :as tt]))

(def ^:private reverted-to
  (atom nil))

(models/defmodel ^:private FakedCard :report_card)

(extend-type (class FakedCard)
  IRevisioned
  (serialize-instance [_ _ obj]
    (assoc obj :serialized true))
  (revert-to-revision! [_ _ _ serialized-instance]
    (reset! reverted-to (dissoc serialized-instance :serialized)))
  (diff-map [_ o1 o2]
    {:o1 o1, :o2 o2})
  (diff-str [_ o1 o2]
    (when o1
      (str "BEFORE=" o1 ",AFTER=" o2))))

(defn- push-fake-revision [card-id & {:keys [message] :as object}]
  (push-revision!
    :entity   FakedCard
    :id       card-id
    :user-id  (user->id :rasta)
    :object   (dissoc object :message)
    :message  message))

;; make sure we call the appropriate post-select methods on `:object` when a revision comes out of the DB. This is
;; especially important for things like Cards where we need to make sure query is normalized
(expect
  {:model "Card", :object {:dataset_query {:type :query}}}
  (#'revision/do-post-select-for-object {:model "Card", :object {:dataset_query {:type "query"}}}))


;;; # Default diff-* implementations

;; Check that pattern matching allows specialization and that string only reflects the keys that have changed
(expect "renamed this Card from \"Tips by State\" to \"Spots by State\"."
  (default-diff-str Card
                    {:name "Tips by State", :private false}
                    {:name "Spots by State", :private false}))

(expect "made this Card private."
  (default-diff-str Card
                    {:name "Spots by State", :private false}
                    {:name "Spots by State", :private true}))


;; Check the fallback sentence fragment for key without specialized sentence fragment
(expect "changed priority from \"Important\" to \"Regular\"."
  (default-diff-str Card
                    {:priority "Important"}
                    {:priority "Regular"}))

;; Check that 2 changes are handled nicely
(expect "made this Card private and renamed it from \"Tips by State\" to \"Spots by State\"."
  (default-diff-str Card
                    {:name "Tips by State", :private false}
                    {:name "Spots by State", :private true}))

;; Check that several changes are handled nicely
(expect "changed priority from \"Important\" to \"Regular\", made this Card private and renamed it from \"Tips by State\" to \"Spots by State\"."
  (default-diff-str Card
                    {:name "Tips by State", :private false, :priority "Important"}
                    {:name "Spots by State", :private true, :priority "Regular"}))


;;; # REVISIONS + PUSH-REVISION!

;; Test that a newly created Card doesn't have any revisions
(expect
  []
  (tt/with-temp Card [{card-id :id}]
    (revisions FakedCard card-id)))

;; Test that we can add a revision
(expect
  [(map->RevisionInstance
    {:model        "FakedCard"
     :user_id      (user->id :rasta)
     :object       {:name "Tips Created by Day", :serialized true}
     :is_reversion false
     :is_creation  false
     :message      "yay!"})]
  (tt/with-temp Card [{card-id :id}]
    (push-fake-revision card-id, :name "Tips Created by Day", :message "yay!")
    (for [revision (revisions FakedCard card-id)]
      (dissoc revision :timestamp :id :model_id))))

;; Test that revisions are sorted in reverse chronological order
(expect [(map->RevisionInstance
          {:model        "FakedCard"
           :user_id      (user->id :rasta)
           :object       {:name "Spots Created by Day", :serialized true}
           :is_reversion false
           :is_creation  false
           :message      nil})
         (map->RevisionInstance
          {:model        "FakedCard"
           :user_id      (user->id :rasta)
           :object       {:name "Tips Created by Day", :serialized true}
           :is_reversion false
           :is_creation  false
           :message      nil})]
  (tt/with-temp Card [{card-id :id}]
    (push-fake-revision card-id, :name "Tips Created by Day")
    (push-fake-revision card-id, :name "Spots Created by Day")
    (->> (revisions FakedCard card-id)
         (map (u/rpartial dissoc :timestamp :id :model_id)))))

;; Check that old revisions get deleted
(expect max-revisions
  (tt/with-temp Card [{card-id :id}]
    ;; e.g. if max-revisions is 15 then insert 16 revisions
    (dorun (repeatedly (inc max-revisions) #(push-fake-revision card-id, :name "Tips Created by Day")))
    (count (revisions FakedCard card-id))))


;;; # REVISIONS+DETAILS

;; Test that add-revision-details properly enriches our revision objects
(expect
  {:is_creation  false
   :is_reversion false
   :message      nil
   :user         {:id (user->id :rasta), :common_name "Rasta Toucan", :first_name "Rasta", :last_name "Toucan"}
   :diff         {:o1 {:name "Initial Name", :serialized true}
                  :o2 {:name "Modified Name", :serialized true}}
   :description  "BEFORE={:name \"Initial Name\", :serialized true},AFTER={:name \"Modified Name\", :serialized true}"}
  (tt/with-temp Card [{card-id :id}]
    (push-fake-revision card-id, :name "Initial Name")
    (push-fake-revision card-id, :name "Modified Name")
    (let [revisions (revisions FakedCard card-id)]
      (assert (= 2 (count revisions)))
      (-> (add-revision-details FakedCard (first revisions) (last revisions))
          (dissoc :timestamp :id :model_id)))))

;; Check that revisions+details pulls in user info and adds description
(expect [(map->RevisionInstance
          {:is_reversion false,
           :is_creation  false,
           :message      nil,
           :user         {:id (user->id :rasta), :common_name "Rasta Toucan", :first_name "Rasta", :last_name "Toucan"},
           :diff         {:o1 nil
                          :o2 {:name "Tips Created by Day", :serialized true}}
           :description  nil})]
  (tt/with-temp Card [{card-id :id}]
    (push-fake-revision card-id, :name "Tips Created by Day")
    (->> (revisions+details FakedCard card-id)
         (map (u/rpartial dissoc :timestamp :id :model_id)))))

;; Check that revisions properly defer to describe-diff
(expect [(map->RevisionInstance
          {:is_reversion false,
           :is_creation  false,
           :message      nil
           :user         {:id (user->id :rasta), :common_name "Rasta Toucan", :first_name "Rasta", :last_name "Toucan"},
           :diff         {:o1 {:name "Tips Created by Day", :serialized true}
                          :o2 {:name "Spots Created by Day", :serialized true}}
           :description  "BEFORE={:name \"Tips Created by Day\", :serialized true},AFTER={:name \"Spots Created by Day\", :serialized true}"})
         (map->RevisionInstance
          {:is_reversion false,
           :is_creation  false,
           :message      nil
           :user         {:id (user->id :rasta), :common_name "Rasta Toucan", :first_name "Rasta", :last_name "Toucan"},
           :diff         {:o1 nil
                          :o2 {:name "Tips Created by Day", :serialized true}}
           :description  nil})]
  (tt/with-temp Card [{card-id :id}]
    (push-fake-revision card-id, :name "Tips Created by Day")
    (push-fake-revision card-id, :name "Spots Created by Day")
    (->> (revisions+details FakedCard card-id)
         (map (u/rpartial dissoc :timestamp :id :model_id)))))

;;; # REVERT

;; Check that revert defers to revert-to-revision!
(expect {:name "Tips Created by Day"}
  (tt/with-temp Card [{card-id :id}]
    (push-fake-revision card-id, :name "Tips Created by Day")
    (let [[{revision-id :id}] (revisions FakedCard card-id)]
      (revert! :entity FakedCard, :id card-id, :user-id (user->id :rasta), :revision-id revision-id)
      @reverted-to)))

;; Check default impl of revert-to-revision! just does mapply upd
(expect ["Spots Created By Day"
         "Tips Created by Day"]
  (tt/with-temp Card [{card-id :id} {:name "Spots Created By Day"}]
    (push-revision! :entity Card, :id card-id, :user-id (user->id :rasta), :object {:name "Tips Created by Day"})
    (push-revision! :entity Card, :id card-id, :user-id (user->id :rasta), :object {:name "Spots Created by Day"})
    [(:name (Card card-id))
     (let [[_ {old-revision-id :id}] (revisions Card card-id)]
       (revert! :entity Card, :id card-id, :user-id (user->id :rasta), :revision-id old-revision-id)
       (:name (Card card-id)))]))

;; Check that reverting to a previous revision adds an appropriate revision
(expect [(map->RevisionInstance
          {:model        "FakedCard"
           :user_id      (user->id :rasta)
           :object       {:name "Tips Created by Day", :serialized true}
           :is_reversion true
           :is_creation  false
           :message      nil})
         (map->RevisionInstance
          {:model        "FakedCard",
           :user_id      (user->id :rasta)
           :object       {:name "Spots Created by Day", :serialized true}
           :is_reversion false
           :is_creation  false
           :message      nil})
         (map->RevisionInstance
          {:model        "FakedCard",
           :user_id      (user->id :rasta)
           :object       {:name "Tips Created by Day", :serialized true}
           :is_reversion false
           :is_creation  false
           :message      nil})]
  (tt/with-temp Card [{card-id :id}]
    (push-fake-revision card-id, :name "Tips Created by Day")
    (push-fake-revision card-id, :name "Spots Created by Day")
    (let [[_ {old-revision-id :id}] (revisions FakedCard card-id)]
      (revert! :entity FakedCard, :id card-id, :user-id (user->id :rasta), :revision-id old-revision-id)
      (->> (revisions FakedCard card-id)
           (map (u/rpartial dissoc :timestamp :id :model_id))))))
