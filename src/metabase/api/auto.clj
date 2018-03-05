(ns metabase.api.auto
  "`/api/auto` endpoints."
  (:require [clojure.tools.logging :as log]
            [compojure.core :refer [GET]]
            [metabase.api.common :as api :refer [defendpoint define-routes]]
            [metabase.models
             [dashboard :as dashboard :refer [Dashboard]]]
            [metabase.util :as u]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

(defendpoint GET "/dashboard/:type/:id"
  "FIXME PLACHOLDER ENDPOINT FOR AUTOMATIC DASHBOARDS"
  [type id]
  (u/prog1 (-> (Dashboard 10)
               api/check-404
               (hydrate [:ordered_cards [:card :in_public_dashboard] :series])
               api/read-check
               (dissoc :id)
               (assoc-in [:ordered_cards 0 :card :dataset_query]))))

(define-routes)
