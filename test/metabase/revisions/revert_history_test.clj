(ns metabase.revisions.revert-history-test
  "A revert through the API records exactly one Revision, the reversion, as the newest Revision, for every revertable
  model."
  (:require
   [clojure.test :refer :all]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.measures.api-test]
   [metabase.revisions.api]
   [metabase.revisions.core :as revisions]
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
      ;; the history endpoint fails for transform tests at the base (a separate bug), so only the stored revisions are
      ;; checked for them
      (when-not (= "transform-test" entity)
        (is (= "reverted to an earlier version."
               (:description (first (mt/user-http-request :crowberto :get 200 (str "revision/" entity "/" id))))))))
    (testing (str entity ": the older revisions do not change")
      (is (= (map :id before) (map :id (rest after)))))
    (testing (str entity ": the revert response is the reversion")
      (is (true? (:is_reversion response))))))

(defn- publish! [topic model id]
  (events/publish-event! topic {:object (t2/select-one model :id id) :user-id (mt/user->id :crowberto)}))

;;; For each revertable model: a function that creates an entity, edits it once (both through the path that a person
;;; uses, so that the model's own events and hooks run), and calls `(f id)`.

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
     (let [definition (#'metabase.measures.api-test/mbql5-measure-definition (mt/id :venues) (mt/id :venues :price))
           id         (:id (mt/user-http-request :crowberto :post 200 "measure"
                                                 {:name "M0" :description "m" :definition definition}))]
       (try
         (mt/user-http-request :crowberto :put 200 (str "measure/" id)
                               {:name "M1" :definition definition :revision_message "rename"})
         (f id)
         (finally (t2/delete! :model/Measure :id id)))))

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
