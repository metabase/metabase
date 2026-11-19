(ns metabase.revisions.models.revision-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.models.interface :as mi]
   [metabase.queries.core :as queries]
   [metabase.revisions.models.revision :as revision]
   [metabase.revisions.models.revision.diff :as revision.diff]
   [metabase.revisions.spec :as revisions.spec]
   [metabase.revisions.test-util :as revisions.tu]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(defn- diff-strings
  "The `revision/describe` of `o1` and `o2`, naming the Collections and Dashboards they reference."
  [model o1 o2]
  (revision/describe model o1 o2 (revision/readable-names (filterv some? [o1 o2]))))

(def ^:private reverted-to
  (atom nil))

(methodical/defmethod t2/table-name ::FakedCard [_model] :report_card)
(derive ::FakedCard :metabase/model)

(defn- do-with-model-i18n-strs! [thunk]
  (mt/with-dynamic-fn-redefs [revision.diff/model-str->i18n-str (fn [model-str]
                                                                  (case model-str
                                                                    "Dashboard"     (deferred-tru "Dashboard")
                                                                    "Card"          (deferred-tru "Card")
                                                                    "Segment"       (deferred-tru "Segment")
                                                                    "Metric"        (deferred-tru "Metric")
                                                                    "NonExistModel" "NonExistModel"
                                                                    "FakeCard"      "FakeCard"))]
    (thunk)))

(defn- snapshot-serialized
  [_rows snapshots]
  (mapv #(assoc % :serialized true) snapshots))

(defn- revert-faked-card!
  [_id _user-id snapshot]
  (reset! reverted-to (dissoc snapshot :serialized)))

(defn- describe-faked-card
  [o1 o2 _names]
  (when o1
    [(str "BEFORE=" (into {} o1) ",AFTER=" (into {} o2))]))

(defmethod revisions.spec/spec ::FakedCard
  [_model]
  {:track    [:name :serialized]
   :skip     []
   :snapshot snapshot-serialized
   :revert!  revert-faked-card!
   :describe describe-faked-card})

(defn- push-fake-revision! [card-id & {:keys [message] :as object}]
  (revisions.tu/push-revision!
   {:entity   ::FakedCard
    :id       card-id
    :user-id  (mt/user->id :rasta)
    :object   (dissoc object :message)
    :message  message}))

(deftest ^:parallel post-select-test
  (testing (str "make sure we call the appropriate post-select methods on `:object` when a revision comes out of the "
                "DB. This is especially important for things like Cards where we need to make sure query is "
                "normalized")
    (is (=? {:model  "Card"
             :object {:card_schema   queries/starting-card-schema-version
                      :dataset_query {:database (mt/id)
                                      :lib/type :mbql/query
                                      :stages   [{:source-table (mt/id :venues)}]}}}
            (mt/derecordize
             (mi/do-after-select :model/Revision {:model "Card", :object {:dataset_query {:database (mt/id)
                                                                                          :type     "query"
                                                                                          :query    {:source-table (mt/id :venues)}}}}))))))

;;; # Default diff-* implementations

(deftest ^:parallel default-diff-str-test
  (testing (str "Check that pattern matching allows specialization and that string only reflects the keys that have "
                "changed")
    (is (= "renamed this Card from \"Tips by State\" to \"Spots by State\"."
           (u/build-sentence
            (diff-strings
             :model/Card
             {:name "Tips by State", :private false}
             {:name "Spots by State", :private false}))))
    (is (= "made this Card private."
           (u/build-sentence
            (diff-strings
             :model/Card
             {:name "Spots by State", :private false}
             {:name "Spots by State", :private true}))))))

(deftest ^:parallel multiple-changes-test
  (testing "Check that 2 changes are handled nicely"
    (is (= "made this Card private and renamed it from \"Tips by State\" to \"Spots by State\"."
           (u/build-sentence
            (diff-strings
             :model/Card
             {:name "Tips by State", :private false}
             {:name "Spots by State", :private true})))))
  (testing "Check that several changes are handled nicely"
    (is (= "turned this to a model, made it private and renamed it from \"Tips by State\" to \"Spots by State\"."
           (u/build-sentence
            (diff-strings
             :model/Card
             {:name "Tips by State", :private false, :type "question"}
             {:name "Spots by State", :private true, :type "model"}))))))

(deftest ^:parallel revision-contains-changes-that-has-havent-been-specced-test
  (testing "When revision object contains key that we don't know how to generate diff-string
           The identifier should be 'This', not 'it' "
    ;; [[metabase.revisions.models.revision.diff/diff-string]] does not know how to generate diff string
    ;; for :collection_unknown_field and it'll return nil. in that case the identifier should not be changed to "made it
    ;; card public"
    (is (= "made this Card public."
           (u/build-sentence
            (diff-strings
             :model/Card
             {:private true :collection_unknown_field nil}
             {:private false :collection_unknown_field 1}))))))

(deftest ^:parallel every-revisioned-model-has-a-diff-description-test
  (testing "Each revisioned model gets a description of a rename"
    (let [model->display-name (cond-> {:model/Card        "Card"
                                       :model/Dashboard   "Dashboard"
                                       :model/Document    "Document"
                                       :model/Exploration "Exploration"
                                       :model/Measure     "Measure"
                                       :model/Segment     "Segment"
                                       :model/Transform   "Transform"}
                                config/ee-available? (assoc :model/TransformTest "Transform test"
                                                            :model/CardTest      "Card test"
                                                            :model/SegmentTest   "Segment test"))]
      ;; a model with a revision spec has Revisions.
      (is (= (set (remove revisions.spec/parent (filter #(= "model" (namespace %)) (revisions.spec/revisioned-models))))
             (set (keys model->display-name))))
      (doseq [[model display-name] model->display-name]
        (testing model
          (mt/with-log-messages-for-level [messages [metabase.revisions.models.revision.diff :warn]]
            (is (= (str "renamed this " display-name " from \"A\" to \"B\".")
                   (u/build-sentence (diff-strings model {:name "A"} {:name "B"}))))
            ;; A missing display name falls back to the model string, which equals the display name for most models.
            (testing "with no warning of a missing display name"
              (is (= [] (messages))))))))))

(deftest ^:parallel model-with-no-display-name-gets-a-description-test
  (testing "A model with no display name gets a description with the model string, and a warning that names the model"
    (mt/with-log-messages-for-level [messages [metabase.revisions.models.revision.diff :warn]]
      (is (= "renamed this NoSuchModel from \"A\" to \"B\"."
             (u/build-sentence (revision.diff/diff-strings* "NoSuchModel" {:name "A"} {:name "B"} {:collection-names {} :dashboard-names {}}))))
      (is (=? [{:level :warn, :message #".*NoSuchModel.*"}]
              (messages))))))

;;; # REVISIONS + PUSH-REVISION!

(deftest new-object-no-revisions-test
  (testing "Test that a newly created Card doesn't have any revisions"
    (mt/with-temp [:model/Card {card-id :id}]
      (is (= []
             (revision/revisions ::FakedCard card-id))))))

(deftest add-revision-test
  (mt/with-model-cleanup [:model/Revision]
    (testing "Test that we can add a revision"
      (mt/with-temp [:model/Card {card-id :id}]
        (push-fake-revision! card-id, :name "Tips Created by Day", :message "yay!")
        (is (=? [(mi/instance
                  :model/Revision
                  {:model        "FakedCard"
                   :user_id      (mt/user->id :rasta)
                   :object       (mi/instance ::FakedCard {:name "Tips Created by Day", :serialized true})
                   :is_reversion false
                   :is_creation  false
                   :message      "yay!"})]
                (for [revision (revision/revisions ::FakedCard card-id)]
                  (dissoc revision :timestamp :id :model_id))))))
    (testing "test that most_recent is correct"
      (mt/with-temp [:model/Card {card-id :id}]
        (doseq [i (range 3)]
          (push-fake-revision! card-id :name (format "%d Tips Created by Day" i) :message "yay!"))
        (revision/settle-revisions! [["FakedCard" card-id]])
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
  (mt/with-temp [:model/Card {card-id :id} {}]
    (let [revision (first (t2/insert-returning-instances! :model/Revision {:model       "Card"
                                                                           :user_id     (mt/user->id :crowberto)
                                                                           :model_id    card-id
                                                                           :object      {}
                                                                           :most_recent false}))]
      (t2/update! :model/Revision :id (:id revision) {:most_recent true})
      (is (= (:timestamp revision)
             (t2/select-one-fn :timestamp :model/Revision :id (:id revision)))))))

(deftest revision-columns-other-than-most-recent-are-frozen-test
  (mt/with-temp [:model/Card {card-id :id} {}]
    (let [revision (first (t2/insert-returning-instances! :model/Revision {:model    "FakedCard"
                                                                           :user_id  (mt/user->id :crowberto)
                                                                           :model_id card-id
                                                                           :object   {:name "Original"}}))]
      (testing "changing object is refused"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You cannot update a Revision"
                              (t2/update! :model/Revision :id (:id revision) {:object {:name "Changed"}})))
        (is (= {:name "Original"} (t2/select-one-fn :object :model/Revision :id (:id revision)))))
      (testing "changing most_recent is accepted"
        (t2/update! :model/Revision :id (:id revision) {:most_recent false})
        (is (false? (t2/select-one-fn :most_recent :model/Revision :id (:id revision))))))))

(deftest sorting-test
  (testing "Test that revisions are sorted in reverse chronological order"
    (mt/with-model-cleanup [:model/Revision]
      (mt/with-temp [:model/Card {card-id :id}]
        (push-fake-revision! card-id, :name "Tips Created by Day")
        (push-fake-revision! card-id, :name "Spots Created by Day")
        (testing "revision/revisions"
          (is (=? [(mi/instance
                    :model/Revision
                    {:model        "FakedCard"
                     :user_id      (mt/user->id :rasta)
                     :object       (mi/instance ::FakedCard {:name "Spots Created by Day", :serialized true})
                     :is_reversion false
                     :is_creation  false
                     :message      nil})
                   (mi/instance
                    :model/Revision
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
      (mt/with-temp [:model/Card {card-id :id}]
        ;; e.g. if max-revisions is 15 then insert 16 revisions
        (dorun (doseq [i (range (inc revision/max-revisions))]
                 (push-fake-revision! card-id, :name (format "Tips Created by Day %d" i))))
        (revision/settle-revisions! [["FakedCard" card-id]])
        (is (= revision/max-revisions
               (count (revision/revisions ::FakedCard card-id))))))))

(deftest settle-revisions-in-one-flush-test
  (testing "the writes of one row settled together leave one flagged Revision, the newest, and at most max-revisions"
    (mt/test-helpers-set-global-values!
      (mt/with-model-cleanup [:model/Revision]
        (mt/with-temp [:model/Card {card-id :id}]
          (doseq [i (range (+ 5 revision/max-revisions))]
            (push-fake-revision! card-id :name (format "Settled %d" i)))
          (revisions.tu/flush-settling!)
          (let [revisions (t2/select [:model/Revision :id :most_recent] :model "FakedCard" :model_id card-id)]
            (is (= revision/max-revisions (count revisions)))
            (is (= [(apply max (map :id revisions))]
                   (keep #(when (:most_recent %) (:id %)) revisions)))))))))

(deftest changed-ignores-what-revision-does-not-hold-test
  (testing "the update of a real :model/Card that changes nothing a revision holds is no change"
    (mt/with-temp [:model/Card {card-id :id :as card} {:name "Tips Created by Day"}]
      (testing "an identical card"
        (is (false? (revision/changed? :model/Card card card))))
      (testing "a change of the name"
        (is (true? (revision/changed? :model/Card card (assoc card :name "Spots Created by Day")))))
      (testing "`:card_schema` is stored in the snapshot, because revert reads it back"
        ;; Excluding it from the snapshot would also equalize the comparison, but then
        ;; a revert of a card would fall back to `starting-card-schema-version` and
        ;; silently downgrade the card on every revert.
        (let [card (t2/select-one :model/Card :id card-id)]
          (is (= (:card_schema card)
                 (:card_schema (revision/snapshot :model/Card card)))))))))

(deftest add-revision-details-test
  (mt/with-model-cleanup [:model/Revision]
    (testing "Test that add-revision-details properly enriches our revision objects"
      (mt/with-temp [:model/Card {card-id :id}]
        (push-fake-revision! card-id, :name "Initial Name")
        (push-fake-revision! card-id, :name "Modified Name")
        (is (=? {:is_creation          false
                 :is_reversion         false
                 :message              nil
                 :user                 {:id (mt/user->id :rasta), :common_name "Rasta Toucan", :first_name "Rasta", :last_name "Toucan"}
                 :diff                 {:before {:name "Initial Name"}
                                        :after  {:name "Modified Name"}}
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
      (mt/with-temp [:model/Card {card-id :id}]
        (push-fake-revision! card-id, :name "Tips Created by Day")
        (is (=? [(mi/instance
                  :model/Revision
                  {:is_reversion         false,
                   :is_creation          false,
                   :message              nil,
                   :user                 {:id (mt/user->id :rasta), :common_name "Rasta Toucan", :first_name "Rasta", :last_name "Toucan"},
                   :diff                 nil
                   :has_multiple_changes false
                   :description          "modified this."})]
                (->> (revision/revisions+details ::FakedCard card-id)
                     (map #(dissoc % :timestamp :id :model_id))
                     (map #(update % :description str)))))))))

(deftest defer-to-describe-diff-test
  (mt/with-model-cleanup [:model/Revision]
    (testing "Check that revisions properly defer to describe-diff"
      (mt/with-temp [:model/Card {card-id :id}]
        (push-fake-revision! card-id, :name "Tips Created by Day")
        (push-fake-revision! card-id, :name "Spots Created by Day")
        (is (=? [(mi/instance
                  :model/Revision
                  {:is_reversion         false,
                   :is_creation          false,
                   :message              nil
                   :user                 {:id (mt/user->id :rasta), :common_name "Rasta Toucan", :first_name "Rasta", :last_name "Toucan"},
                   :diff                 {:before {:name "Tips Created by Day"}
                                          :after  {:name "Spots Created by Day"}}
                   :has_multiple_changes false
                   :description          (str "BEFORE={:name \"Tips Created by Day\", :serialized true},AFTER="
                                              "{:name \"Spots Created by Day\", :serialized true}.")})
                 (mi/instance
                  :model/Revision
                  {:is_reversion         false,
                   :is_creation          false,
                   :message              nil
                   :user                 {:id (mt/user->id :rasta), :common_name "Rasta Toucan", :first_name "Rasta", :last_name "Toucan"},
                   :diff                 nil
                   :has_multiple_changes false
                   :description          "modified this."})]
                (->> (revision/revisions+details ::FakedCard card-id)
                     (map #(dissoc % :timestamp :id :model_id))
                     (map #(update % :description str)))))))))

;;; # Concurrency

(deftest revisions-can-be-created-concurrently
  (mt/test-helpers-set-global-values!
    (mt/with-model-cleanup [:model/Revision]
      (mt/with-temp [:model/Card {card-id :id} {}]
        ;; we need one revision to exist already. Note that this means two concurrent `is_creation` revision
        ;; insertions will have issues (both will be marked `most_recent`), but I don't think this is possible in
        ;; practice.
        (push-fake-revision! card-id :name "Creation")
        ;; set up the concurrency issue
        ;; thread 1 will start transaction, add the revision, then wait while...
        ;; thread 2 starts a separate transaction and adds its own revision
        ;; then both threads commit their transactions.
        (let [p1 (promise)
              p2 (promise)]
          (let [other (future (t2/with-transaction [_conn]
                                (push-fake-revision! card-id :name "Name1")
                                (deref p1 100 ::timeout)
                                (deliver p2 ::done)))]
            (t2/with-transaction [_conn]
              (push-fake-revision! card-id :name "Name2")
              (deliver p1 ::done))
            (deref other 1000 ::timeout))
          ;; sanity check: nothing timed out, both transactions finished
          (is (= ::done (deref p1 100 ::timeout) (deref p2 100 ::timeout)))
          (revisions.tu/flush-settling!)
          ;; we only have one `most_recent: true`
          (is (= 1 (t2/count :model/Revision
                             :model_id card-id :model "FakedCard"
                             :most_recent true)))
          ;; we have the expected total number of revisions
          (is (= 3 (t2/count :model/Revision
                             :model_id card-id :model "FakedCard"))))))))

;;; # REVERT

(deftest revert-defer-to-revert-to-revision!-test
  (mt/with-model-cleanup [:model/Revision]
    (testing "Check that revert defers to revert-to-revision!"
      (mt/with-temp [:model/Card {card-id :id}]
        (push-fake-revision! card-id, :name "Tips Created by Day")
        (let [[{revision-id :id}] (revision/revisions ::FakedCard card-id)]
          (revision/revert! {:entity ::FakedCard, :id card-id, :user-id (mt/user->id :rasta), :revision-id revision-id})
          (is (= {:name "Tips Created by Day"}
                 @reverted-to)))))))

(deftest revert-to-revision!-default-impl-test
  (mt/with-model-cleanup [:model/Revision]
    (testing "Check default impl of revert-to-revision! just does mapply upd"
      (mt/with-temp [:model/Card {card-id :id} {:name "Spots Created By Day"}]
        (revisions.tu/push-revision! {:entity :model/Card, :id card-id, :user-id (mt/user->id :rasta), :object {:name "Tips Created by Day"}})
        (revisions.tu/push-revision! {:entity :model/Card, :id card-id, :user-id (mt/user->id :rasta), :object {:name "Spots Created by Day"}})
        (is (= "Spots Created By Day"
               (:name (t2/select-one :model/Card :id card-id))))
        (let [[_ {old-revision-id :id}] (revision/revisions :model/Card card-id)]
          (revision/revert! {:entity :model/Card, :id card-id, :user-id (mt/user->id :rasta), :revision-id old-revision-id})
          (is (= "Tips Created by Day"
                 (:name (t2/select-one :model/Card :id card-id)))))))))

(deftest revert-to-older-shaped-snapshot-of-current-state-adds-no-revision-test
  (testing "a revert to a snapshot that an older version recorded, equal to the current state in what a Revision records"
    (mt/with-temp [:model/Segment {segment-id :id :as segment} {:name "Tracked"}]
      (let [snapshot (revision/snapshot :model/Segment segment)
            older    (assoc snapshot :id segment-id :entity_id (:entity_id segment) :creator_id (:creator_id segment))
            revision (fn [object]
                       (t2/insert-returning-instance! :model/Revision {:model       "Segment"
                                                                       :model_id    segment-id
                                                                       :user_id     (mt/user->id :rasta)
                                                                       :object      object
                                                                       :is_creation false}))
            target   (revision older)]
        (revision snapshot)
        (revision/revert! {:entity      :model/Segment
                           :id          segment-id
                           :user-id     (mt/user->id :rasta)
                           :revision-id (:id target)})
        (is (= 2 (t2/count :model/Revision :model "Segment" :model_id segment-id)))))))

(deftest reverting-should-add-revision-test
  (mt/with-model-cleanup [:model/Revision]
    (testing "Check that reverting to a previous revision adds an appropriate revision"
      (mt/with-temp [:model/Card {card-id :id}]
        (push-fake-revision! card-id :name "Tips Created by Day")
        (push-fake-revision! card-id :name "Spots Created by Day")
        (let [[_ {old-revision-id :id}] (revision/revisions ::FakedCard card-id)]
          (revision/revert! {:entity ::FakedCard, :id card-id, :user-id (mt/user->id :rasta), :revision-id old-revision-id})
          (is (partial=
               [(mi/instance
                 :model/Revision
                 {:model        "FakedCard"
                  :user_id      (mt/user->id :rasta)
                  :object       {:name "Tips Created by Day", :serialized true}
                  :is_reversion true
                  :is_creation  false
                  :message      nil})
                (mi/instance
                 :model/Revision
                 {:model        "FakedCard",
                  :user_id      (mt/user->id :rasta)
                  :object       {:name "Spots Created by Day", :serialized true}
                  :is_reversion false
                  :is_creation  false
                  :message      nil})
                (mi/instance
                 :model/Revision
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
                                                         :is_creation  true}
                                                        {:collection-names {} :dashboard-names {}}))))
         (testing "reversion"
           (is (= {:has_multiple_changes false
                   :description          "reverted to an earlier version."}
                  (#'revision/revision-description-info model
                                                        {:object       {:name "New Object"}
                                                         :is_reversion false
                                                         :is_creation  false}
                                                        {:object       {:name "New Object"}
                                                         :is_reversion true
                                                         :is_creation  false}
                                                        {:collection-names {} :dashboard-names {}}))))
         (testing "multiple changes"
           (is (= {:description          "changed the display from table to bar and turned this to a model."
                   :has_multiple_changes true}
                  (#'revision/revision-description-info model
                                                        {:object       {:type "question"
                                                                        :display :table}
                                                         :is_reversion false
                                                         :is_creation  false}
                                                        {:object       {:type "model"
                                                                        :display :bar}
                                                         :is_reversion false
                                                         :is_creation  false}
                                                        {:collection-names {} :dashboard-names {}}))))
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
                                                         :is_creation  false}
                                                        {:collection-names {} :dashboard-names {}})))))))))

(deftest revision-tracks-metabase-version
  (testing "creating a new revision uses current metabase version"
    (let [new-version "just a test"]
      (mt/with-temp [:model/Card {card-id :id}]
        (push-fake-revision! card-id, :name "one", :message "yay!")
        (with-redefs [config/mb-version-string new-version]
          (push-fake-revision! card-id, :name "two", :message "yay!"))
        (is (=? [{:metabase_version new-version}
                 {:metabase_version config/mb-version-string}]
                (revision/revisions ::FakedCard card-id)))))))

(deftest revisions+details-names-collections-together-test
  (mt/with-temp [:model/Collection {coll-a :id} {:name "Shelf A"}
                 :model/Collection {coll-b :id} {:name "Shelf B"}
                 :model/Collection {coll-c :id} {:name "Shelf C"}
                 :model/Card       {card-id :id} {:collection_id coll-a}]
    (mt/with-test-user :crowberto
      (let [move!      (fn [collection-id]
                         (t2/update! :model/Card :id card-id {:collection_id collection-id})
                         (revisions.tu/push-revision! {:entity  :model/Card
                                                       :id      card-id
                                                       :user-id (mt/user->id :crowberto)
                                                       :object  (t2/select-one :model/Card :id card-id)}))
            details    #(revision/revisions+details :model/Card card-id)
            call-count (fn [thunk]
                         (t2/with-call-count [call-count]
                           (doall (thunk))
                           (call-count)))
            extra      #(- (call-count details)
                           (call-count (fn [] (revision/revisions :model/Card card-id))))]
        (move! coll-a)
        (move! coll-b)
        (let [one-move (extra)]
          (move! coll-c)
          (move! coll-a)
          (testing "moves are described with names of readable Collections"
            (is (= ["moved this Card from Shelf C to Shelf A."
                    "moved this Card from Shelf B to Shelf C."
                    "moved this Card from Shelf A to Shelf B."]
                   (map (comp str :description) (take 3 (details))))))
          (testing "further moves cost no further queries past loading their revisions"
            (is (= one-move (extra)))))))))
