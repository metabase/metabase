(ns metabase-enterprise.transforms.models.transform
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Transform [_model] :transforms)

(doto :model/Transform
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(t2/deftransforms :model/Transform
  {:source mi/transform-json
   :target mi/transform-json})

(t2/define-before-insert :model/Transform
  [transform]
  (let [source-db (-> transform :source :query :database)]
    (cond-> transform
      (pos-int? source-db) (assoc :database_id source-db))))

(t2/define-before-update :model/Transform
  [transform]
  (let [source-db (-> (t2/changes transform) :source :query :database)]
    (cond-> transform
      (pos-int? source-db) (assoc :database_id source-db))))

(comment

  (t2/insert-returning-pk! :model/Transform {:name "Gadget Products"
                                             :source {:type "query"
                                                      :query {:database 1
                                                              :type "native",
                                                              :native {:query "SELECT * FROM PRODUCTS WHERE CATEGORY = 'Gadget'"
                                                                       :template-tags {}}}}
                                             :target {:type "table"
                                                      :database 1
                                                      :schema "transforms"
                                                      :table "gadget_products"}})

  (t2/update! :model/Transform 2 {:name "Gadget Products xxx"
                                  :source {:type "query"
                                           :query {:database 1
                                                   :type "native",
                                                   :native {:query "SELECT * FROM PRODUCTS WHERE CATEGORY = 'Gadget'"
                                                            :template-tags {}}}}
                                  :target {:type "table"
                                           :database 1
                                           :schema "transforms"
                                           :table "gadget_products"}})

  (t2/select-one :model/Transform)
  (t2/select :model/Transform)
  (t2/delete! :model/Transform 1))
