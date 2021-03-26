(ns metabase-enterprise.pulse
  (:require [metabase-enterprise.enhancements.ee-strategy-impl :as ee-strategy-impl]
            [metabase.pulse.interface :as i])
  (:import metabase.pulse.interface.SubscriptionParameters))

(def ^:private parameters-impl
  (reify
    i/SubscriptionParameters
    (the-parameters [_ pulse dashboard]
      (some seq (map :parameters [pulse dashboard])))))

(def ee-strategy-parameters-impl
  "Enterprise way of getting dashboard filter parameters"
  (ee-strategy-impl/reify-ee-strategy-impl parameters-impl i/default-parameters-impl i/SubscriptionParameters))
