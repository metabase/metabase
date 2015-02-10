(ns metabase.api.dash
  "/api/meta/dash endpoints."
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer [hydrate]]
                             [dashboard :refer [Dashboard]])))

(defendpoint GET "/" [org f] ; TODO - what to do with f ?
  (-> (sel :many Dashboard :organization_id org)
      (hydrate :creator :organization)))

(define-routes)
