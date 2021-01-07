(ns metabase.pulse.test-util
  (:require [metabase.models.pulse :as models.pulse :refer [Pulse]]
            [metabase.models.pulse-card :refer [PulseCard]]
            [metabase.pulse :as pulse]
            [metabase.query-processor-test :as qp.test]
            [metabase.test.data.users :as users]
            [metabase.util :as u]
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
