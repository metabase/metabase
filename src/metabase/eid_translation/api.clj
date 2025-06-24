(ns metabase.eid-translation.api
  "`/api/eid-translation` routes."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.eid-translation.util :as eid-translation]))

;;; endpoints in this namespace are not currently gated with `+auth` or whatever -- meaning they are public facing --
;;; keep this in mind!

(api.macros/defendpoint :post "/translate"
  "Translate entity IDs to model IDs."
  [_route-params
   _query-params
   {:keys [entity_ids]} :- [:map
                            [:entity_ids :map]]]
  {:entity_ids (eid-translation/model->entity-ids->ids entity_ids)})
