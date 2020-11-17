(ns metabase.pulse.test-util
  (:require [metabase
             [pulse :as pulse]
             [query-processor-test :as qp.test]
             [util :as u]]
            [metabase.models
             [pulse :as models.pulse :refer [Pulse]]
             [pulse-card :refer [PulseCard]]]
            [metabase.test.data.users :as users]
            [toucan.util.test :as tt]))

(defn send-pulse-created-by-user!
  "Create a Pulse with `:creator_id` of `user-kw`, and simulate sending it, executing it and returning the results."
  [user-kw card]
  (tt/with-temp* [Pulse      [pulse {:creator_id (users/user->id user-kw)}]
                  PulseCard  [_ {:pulse_id (:id pulse), :card_id (u/get-id card)}]]
    (with-redefs [pulse/send-notifications!    identity
                  pulse/results->notifications (fn [_ results]
                                                 (vec results))]
      (let [[{:keys [result]}] (pulse/send-pulse! pulse)]
        (qp.test/rows result)))))
