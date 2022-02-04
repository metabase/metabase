(ns metabase.pulse.interface
  "Interface for the way parameters are handled by dashboard subscriptions, which is different in the EE and OSS
  versions."
  (:require [potemkin :as p]))

(p/defprotocol+ SubscriptionParameters
  "Get the parameters to be used for a dashboard subscription"
  (the-parameters [this pulse dashboard]
    "Return appropriate filter parameters"))

(def default-parameters-impl
  "OSS way of getting filter parameters for a dashboard subscription"
  (reify
    SubscriptionParameters
    (the-parameters [_ _pulse dashboard]
      (:parameters dashboard))))
