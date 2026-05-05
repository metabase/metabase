(ns metabase.eid-translation.api
  "`/api/eid-translation` routes."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.eid-translation.util :as eid-translation]))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/translate"
  "Translate entity IDs to model IDs."
  [_route-params
   _query-params
   {:keys [entity_ids]} :- [:map
                            [:entity_ids :map]]]
  {:entity_ids (eid-translation/model->entity-ids->ids entity_ids)})
