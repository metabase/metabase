(ns metabase.events.schema-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.core :as events]
   [metabase.queries.events.schema]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(defn- event
  "A minimal valid event of `model` for the closed entity event schemas."
  [model]
  (cond-> {:object (t2/instance model {:id 1}) :user-id 1}
    (= model :model/Card) (assoc :previous-object (t2/instance model {:id 1}))))

(deftest ^:parallel update-topics-accept-reverted-to-revision-id-test
  (doseq [[topic model] {:event/card-update      :model/Card
                         :event/dashboard-update :model/Dashboard
                         :event/segment-update   :model/Segment
                         :event/measure-update   :model/Measure}]
    (testing topic
      (is (mr/validate (events/event-schema topic) (event model)))
      (is (mr/validate (events/event-schema topic) (assoc (event model) :reverted-to-revision-id 7)))
      (testing "the id must be positive"
        (is (not (mr/validate (events/event-schema topic) (assoc (event model) :reverted-to-revision-id 0)))))
      (testing "no other key is allowed"
        (is (not (mr/validate (events/event-schema topic) (assoc (event model) :reverted? true))))))))

(deftest ^:parallel create-and-delete-topics-refuse-reverted-to-revision-id-test
  (doseq [[topic model] {:event/card-create      :model/Card
                         :event/card-delete      :model/Card
                         :event/dashboard-create :model/Dashboard
                         :event/dashboard-delete :model/Dashboard
                         :event/segment-create   :model/Segment
                         :event/segment-delete   :model/Segment
                         :event/measure-create   :model/Measure
                         :event/measure-delete   :model/Measure}]
    (testing topic
      (let [e (dissoc (event model) :previous-object)]
        (is (mr/validate (events/event-schema topic) e))
        (is (not (mr/validate (events/event-schema topic) (assoc e :reverted-to-revision-id 7))))))))
