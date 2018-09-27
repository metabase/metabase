(ns metabase.api.metaml
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :as api]
            [metabase.metaml.core :as metaml]
            [metabase.models
             [card :refer [Card]]
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.models.query.permissions :as query-perms]
            [metabase.util :as u]))

(api/defendpoint GET "/fill-nils/card/:card-id/:field-id"
  "Fill nils in field `FIELD-ID` in results of card `CARD-ID`.
   Card has to return raw data or some subset thereof."
  [card-id field-id]
  (let [field (api/read-check Field field-id)
        card  (api/read-check Card card-id)]
    (assert (-> card :database_id Database :engine (= :bigquery)))
    (assert (-> card :dataset_query :query :aggregation nil?))
    (assert (-> card :dataset_query :query :breakout nil?))
    (metaml/fill-nils (:dataset_query card) field)))

(api/defendpoint GET "/fill-nils/field/:id"
  "Fill nils in field `ID`."
  [id]
  (let [field (api/read-check Field id)
        table (-> field :table_id Table)]
    (assert (-> table :db_id Database :engine (= :bigquery)))
    (metaml/fill-nils {:database (:db_id table)
                       :type     :query
                       :query    {:source-table (u/get-id table)}}
                      field)))

(api/define-routes)
