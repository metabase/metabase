(ns metabase.revisions.revert-history-test
  "A revert through the API records exactly one Revision, the reversion, as the newest Revision, for every revertable
  model."
  (:require
   [clojure.test :refer :all]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.measures.test-util :as measures.tu]
   [metabase.models.interface :as mi]
   [metabase.revisions.api]
   [metabase.revisions.core :as revisions]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- revert-to-creation!
  "Reverts `model` `id` to its first Revision through the API. Checks that the revert adds exactly one Revision, that
  it is the newest one, that it is the reversion, and that the older Revisions do not change."
  [model entity id]
  (let [before   (revisions/revisions model id)
        creation (last before)
        response (mt/user-http-request :crowberto :post 200 "revision/revert"
                                       {:entity entity :id id :revision_id (:id creation)})
        after    (revisions/revisions model id)]
    (testing (str entity ": one revision for one revert")
      (is (= (inc (count before)) (count after))))
    (testing (str entity ": the newest revision is the reversion")
      (is (true? (:is_reversion (first after))))
      (is (= "reverted to an earlier version."
             (:description (first (mt/user-http-request :crowberto :get 200 (str "revision/" entity "/" id)))))))
    (testing (str entity ": the older revisions do not change")
      (is (= (map :id before) (map :id (rest after)))))
    (testing (str entity ": the revert response is the reversion")
      (is (true? (:is_reversion response))))))

(defn- publish! [topic model id]
  (events/publish-event! topic {:object (t2/select-one model :id id) :user-id (mt/user->id :crowberto)}))

;;; For each revertable model: a function that creates an entity, edits it once with the events and hook calls of an
;;; API edit, and calls `(f id)`.

(def ^:private with-edited-entity
  {:model/Card
   (fn [f]
     (let [id (:id (mt/user-http-request :crowberto :post 200 "card"
                                         {:name "C0" :display "table" :visualization_settings {}
                                          :dataset_query (let [mp (mt/metadata-provider)]
                                                           (lib/query mp (lib.metadata/table mp (mt/id :venues))))}))]
       (try
         (mt/user-http-request :crowberto :put 200 (str "card/" id) {:name "C1"})
         (f id)
         (finally (t2/delete! :model/Card :id id)))))

   :model/Dashboard
   (fn [f]
     (mt/with-temp [:model/Card {card-id :id} {:name "Dash card"}]
       (let [id (:id (mt/user-http-request :crowberto :post 200 "dashboard" {:name "B0"}))]
         (try
           (mt/user-http-request :crowberto :put 200 (str "dashboard/" id)
                                 {:name "B1" :dashcards [{:id -1 :card_id card-id :row 0 :col 0 :size_x 4 :size_y 4}] :tabs []})
           (f id)
           (finally (t2/delete! :model/Dashboard :id id))))))

   :model/Document
   (fn [f]
     (mt/with-temp [:model/Collection {coll :id} {}]
       (let [id (:id (mt/user-http-request :crowberto :post 200 "document"
                                           {:name "D0" :collection_id coll
                                            :document {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "v0"}]}]}}))]
         (try
           (mt/user-http-request :crowberto :put 200 (str "document/" id) {:name "D1"})
           (f id)
           (finally (t2/delete! :model/Document :id id))))))

   :model/Segment
   (fn [f]
     (mt/with-temp [:model/Segment {id :id} {:name "S0" :table_id (mt/id :venues) :creator_id (mt/user->id :crowberto)
                                             :definition {:filter [:= [:field (mt/id :venues :price) nil] 4]}}]
       ;; the segment API publishes these events after its writes
       (publish! :event/segment-create :model/Segment id)
       (t2/update! :model/Segment id {:name "S1"})
       (publish! :event/segment-update :model/Segment id)
       (f id)))

   :model/Measure
   (fn [f]
     (let [definition (measures.tu/measure-definition (mt/id :venues) (mt/id :venues :price))
           id         (:id (mt/user-http-request :crowberto :post 200 "measure"
                                                 {:name "M0" :description "m" :definition definition}))]
       (try
         (mt/user-http-request :crowberto :put 200 (str "measure/" id)
                               {:name "M1" :definition definition :revision_message "rename"})
         (f id)
         (finally
           (t2/delete! :model/Measure :id id)
           (t2/delete! :model/Revision :model "Measure" :model_id id)))))

   :model/Transform
   (fn [f]
     (mt/with-premium-features #{:transforms-basic}
       (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
         (mt/with-temp [:model/Transform {id :id} {:name "X0"}]
           ;; the transform API publishes these events after its writes
           (publish! :event/transform-create :model/Transform id)
           (t2/update! :model/Transform id {:name "X1"})
           (publish! :event/transform-update :model/Transform id)
           (f id)))))

   :model/TransformTest
   (fn [f]
     (mt/with-premium-features #{:transforms-basic}
       (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
         (mt/with-current-user (mt/user->id :crowberto)
           ;; the TransformTest hooks publish its events from any writer
           (mt/with-temp [:model/Transform     {transform-id :id} {}
                          :model/TransformTest {id :id} {:transform_id transform-id :name "T0"}]
             (t2/update! :model/TransformTest id {:name "T1"})
             (f id))))))})

(deftest every-revertable-model-revert-history-test
  (testing "every model that POST /api/revision/revert accepts records one revision for one revert"
    (doseq [[entity model] @#'metabase.revisions.api/entity->model]
      (testing entity
        (let [setup (with-edited-entity model)]
          (is (some? setup) (str "add a setup for " model " to with-edited-entity"))
          (when setup
            (setup #(revert-to-creation! model entity %))))))))

(deftest document-second-revert-test
  ((with-edited-entity :model/Document)
   (fn [id]
     (revert-to-creation! :model/Document "document" id)
     (testing "a second revert, back to the newest edit"
       (let [edit (second (revisions/revisions :model/Document id))]
         (is (= "D1" (get-in edit [:object :name])))
         (let [n (count (revisions/revisions :model/Document id))]
           (mt/user-http-request :crowberto :post 200 "revision/revert"
                                 {:entity "document" :id id :revision_id (:id edit)})
           (is (= (inc n) (count (revisions/revisions :model/Document id))))
           (is (true? (:is_reversion (first (revisions/revisions :model/Document id)))))
           (is (= "D1" (t2/select-one-fn :name :model/Document :id id)))))))))

(deftest every-revertable-model-revert-to-latest-revision-test
  (testing "a revert to the latest revision of an entity in that state records no revision"
    (doseq [[entity model] @#'metabase.revisions.api/entity->model]
      (testing entity
        ((with-edited-entity model)
         (fn [id]
           (let [before (revisions/revisions model id)]
             (mt/user-http-request :crowberto :post 200 "revision/revert"
                                   {:entity entity :id id :revision_id (:id (first before))})
             (is (= (map :id before) (map :id (revisions/revisions model id)))))))))))

(deftest card-revert-to-revision-without-card-schema-test
  (testing "a revert to a Card revision that differs from the latest revision only in :card_schema records no revision"
    ((with-edited-entity :model/Card)
     (fn [id]
       (let [object  (:object (first (revisions/revisions :model/Card id)))
             insert! #(t2/insert-returning-pk! :model/Revision
                                               {:model "Card" :model_id id :user_id (mt/user->id :crowberto)
                                                :object % :is_creation false :is_reversion false})
             target  (insert! (dissoc object :card_schema))
             _       (insert! object)
             before  (revisions/revisions :model/Card id)]
         (mt/user-http-request :crowberto :post 200 "revision/revert" {:entity "card" :id id :revision_id target})
         (is (= (map :id before) (map :id (revisions/revisions :model/Card id)))))))))

(def ^:private document-hydrated-keys
  #{:creator :can_write :can_delete :can_restore :is_remote_synced})

(defn- insert-old-form-revision!
  "Inserts a Revision of the Document `id` as earlier versions stored it: `object` with the name `doc-name` and the
  hydrated keys. Returns its id."
  [id object doc-name & {:keys [creation?]}]
  (t2/insert-returning-pk! :model/Revision
                           {:model "Document" :model_id id :user_id (mt/user->id :crowberto)
                            :object (assoc object
                                           :name doc-name
                                           :creator {:id (mt/user->id :crowberto) :email "crowberto@metabase.com"}
                                           :can_write true :can_delete false :can_restore false
                                           :is_remote_synced false)
                            :is_creation (boolean creation?) :is_reversion false}))

(deftest document-revert-to-old-form-revision-test
  (testing "a revert to a Document revision that holds the hydrated keys stores none of them"
    ((with-edited-entity :model/Document)
     (fn [id]
       (let [latest (first (revisions/revisions :model/Document id))
             old-id (insert-old-form-revision! id (:object latest) "D-old")]
         (mt/user-http-request :crowberto :put 200 (str "document/" id) {:name "D2"})
         (mt/user-http-request :crowberto :post 200 "revision/revert"
                               {:entity "document" :id id :revision_id old-id})
         (let [newest (first (revisions/revisions :model/Document id))]
           (is (true? (:is_reversion newest)))
           (is (= "D-old" (t2/select-one-fn :name :model/Document :id id)))
           (is (= {} (select-keys (:object newest) document-hydrated-keys))
               "the reversion stores none of the hydrated keys")))))))

(deftest document-api-edit-over-old-form-revision-test
  (testing "an API edit that keeps the name of the latest revision, which holds the hydrated keys, records no revision"
    ((with-edited-entity :model/Document)
     (fn [id]
       (insert-old-form-revision! id (:object (first (revisions/revisions :model/Document id))) "D1")
       (let [before (revisions/revisions :model/Document id)]
         (mt/user-http-request :crowberto :put 200 (str "document/" id) {:name "D1"})
         (is (= (map :id before) (map :id (revisions/revisions :model/Document id)))))))))

(deftest document-revert-over-old-form-revisions-test
  (testing "a revert to the creation, when every revision holds the hydrated keys, records one revision: the reversion"
    ((with-edited-entity :model/Document)
     (fn [id]
       (let [object (:object (first (revisions/revisions :model/Document id)))]
         (t2/delete! :model/Revision :model "Document" :model_id id)
         (let [creation-id (insert-old-form-revision! id object "D0" :creation? true)
               edit-id     (insert-old-form-revision! id object "D1")]
           (mt/user-http-request :crowberto :post 200 "revision/revert"
                                 {:entity "document" :id id :revision_id creation-id})
           (let [[reversion & older] (revisions/revisions :model/Document id)]
             (is (= [edit-id creation-id] (map :id older)))
             (is (true? (:is_reversion reversion)))
             (is (= "D0" (get-in reversion [:object :name])))
             (is (= "D0" (t2/select-one-fn :name :model/Document :id id))))))))))

(deftest document-revert-to-new-form-copy-of-old-form-revision-test
  (testing "a revert to a revision equal to the latest revision, which holds the hydrated keys, records no revision"
    ((with-edited-entity :model/Document)
     (fn [id]
       (let [edit (first (revisions/revisions :model/Document id))]
         (is (= "D1" (get-in edit [:object :name])))
         (insert-old-form-revision! id (:object edit) "D1")
         (let [before (revisions/revisions :model/Document id)]
           (mt/user-http-request :crowberto :post 200 "revision/revert"
                                 {:entity "document" :id id :revision_id (:id edit)})
           (is (= (map :id before) (map :id (revisions/revisions :model/Document id))))))))))

(deftest document-revert-at-the-maximum-of-revisions-test
  (testing "a revert of a Document at the maximum of revisions"
    ((with-edited-entity :model/Document)
     (fn [id]
       (let [object (:object (first (revisions/revisions :model/Document id)))]
         (dotimes [i (- revision/max-revisions 2)]
           (t2/insert! :model/Revision {:model "Document" :model_id id :user_id (mt/user->id :crowberto)
                                        :object (assoc object :name (str "F" i)) :is_creation false :is_reversion false}))
         (let [before (revisions/revisions :model/Document id)]
           (is (= revision/max-revisions (count before)))
           (mt/user-http-request :crowberto :post 200 "revision/revert"
                                 {:entity "document" :id id :revision_id (:id (last before))})
           (let [after (revisions/revisions :model/Document id)]
             (testing "drops only the oldest revision"
               (is (= (butlast (map :id before)) (map :id (rest after)))))
             (testing "only the reversion is the most recent revision"
               (is (true? (:is_reversion (first after))))
               (is (= (cons true (repeat (dec (count after)) false)) (map :most_recent after)))))))))))

(deftest document-revert-to-latest-revision-without-a-column-test
  (testing "a revert to the latest revision, which lacks a column, after a write that records no revision"
    ((with-edited-entity :model/Document)
     (fn [id]
       (is (contains? (t2/select-one (t2/table-name :model/Document) :id id) :exploration_id))
       (let [latest (first (revisions/revisions :model/Document id))
             target (t2/insert-returning-pk! :model/Revision
                                             {:model "Document" :model_id id :user_id (mt/user->id :crowberto)
                                              :object (dissoc (:object latest) :exploration_id)
                                              :is_creation false :is_reversion false})]
         ;; as an import writes: the hook does not publish
         (binding [mi/*deserializing?* true]
           (t2/update! :model/Document id {:name "Imported"}))
         (let [before (revisions/revisions :model/Document id)]
           (mt/user-http-request :crowberto :post 200 "revision/revert"
                                 {:entity "document" :id id :revision_id target})
           (let [after (revisions/revisions :model/Document id)]
             (is (= "D1" (t2/select-one-fn :name :model/Document :id id)) "the row has the target state")
             (is (or (= (map :id before) (map :id after))
                     (true? (:is_reversion (first after))))
                 (str "the revert adds no revision, or the newest revision is the reversion; newest: "
                      (pr-str (select-keys (first after) [:id :is_creation :is_reversion])))))))))))
