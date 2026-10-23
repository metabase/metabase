(ns metabase.data-apps.rules
  "The Library-only rules the data-app route guards hold a data app's requests to, which refuse every request without
  the data-apps feature."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(defn- unavailable
  "The error refusing a data-app request where data apps aren't available."
  []
  (ex-info (tru "Data apps aren''t available on this instance.") {:status-code 403}))

(defenterprise check-query!
  "Throws a 403 unless a data app may run `query`, a legacy or MBQL 5 query map."
  metabase-enterprise.data-apps.rules
  [_query]
  (throw (unavailable)))

(defenterprise check-card!
  "Throws a 403 unless a data app may read the card with `card-id`, an ID or an entity ID, when such a card exists."
  metabase-enterprise.data-apps.rules
  [_card-id]
  (throw (unavailable)))
