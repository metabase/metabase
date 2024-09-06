(ns hooks.metabase.api.common-test
  (:require
   [clj-kondo.hooks-api :as api]
   [clojure.test :refer :all]
   [hooks.metabase.api.common]))

(deftest ^:parallel defendpoint-test
  (is (= '(do
            compojure.core/POST
            (clojure.core/defn
              POST_:id_copy
              "Copy a `Card`, with the new name 'Copy of _name_'"
              [id]
              {id [:maybe ms/PositiveInt]}
              (let [orig-card (api/read-check Card id)
                    new-name (str (trs "Copy of ") (:name orig-card))
                    new-card (assoc orig-card :name new-name)]
                (-> (card/create-card! new-card @api/*current-user*)
                    hydrate-card-details
                    (assoc :last-edit-info (last-edit/edit-information-for-user @api/*current-user*))))))
         (-> {:node (-> '(api/defendpoint POST "/:id/copy"
                           "Copy a `Card`, with the new name 'Copy of _name_'"
                           [id]
                           {id [:maybe ms/PositiveInt]}
                           (let [orig-card (api/read-check Card id)
                                 new-name  (str (trs "Copy of ") (:name orig-card))
                                 new-card  (assoc orig-card :name new-name)]
                             (-> (card/create-card! new-card @api/*current-user*)
                                 hydrate-card-details
                                 (assoc :last-edit-info (last-edit/edit-information-for-user @api/*current-user*)))))
                        pr-str
                        api/parse-string)}
             hooks.metabase.api.common/defendpoint
             :node
             api/sexpr))))
