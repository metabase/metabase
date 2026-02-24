(ns metabase-enterprise.product-analytics.settings
  "Computed settings surfaced to the frontend for Product Analytics."
  (:require
   [metabase.product-analytics.core :as pa]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defsetting product-analytics-events-table-id
  (deferred-tru "The Metabase internal ID of the V_PA_EVENTS table, used by the frontend to build the automagic dashboard URL.")
  :visibility :public
  :setter     :none
  :getter     (fn []
                (t2/select-one-pk :model/Table
                                  :db_id  pa/product-analytics-db-id
                                  :name   "V_PA_EVENTS"
                                  :active true)))
