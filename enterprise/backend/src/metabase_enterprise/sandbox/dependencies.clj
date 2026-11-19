(ns metabase-enterprise.sandbox.dependencies
  "The functions of the dependencies spec of a Sandbox.")

(set! *warn-on-reflection* true)

(defn dependencies
  "The dependencies of `sandbox`: the card that it filters with."
  [{:keys [card_id]}]
  (if card_id
    {:card #{card_id}}
    {}))
