(ns metabase.data-apps.guards
  "The rules the data-app route guards hold a data app's requests to, the resources of its own app, which refuse every
  request without the data-apps feature."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(defn- unavailable
  "The error refusing a data-app request where data apps aren't available."
  []
  (ex-info (tru "Data apps aren''t available on this instance.") {:status-code 403}))

(defenterprise check-query!
  "Throws a 403 unless the data app of `request` may run `query`, a legacy or MBQL 5 query map."
  metabase-enterprise.data-apps.guards
  [_request _query]
  (throw (unavailable)))
