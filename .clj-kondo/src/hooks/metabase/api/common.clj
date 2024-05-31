(ns hooks.metabase.api.common
  (:require
   [clj-kondo.hooks-api :as api]
   [clojure.string :as str]))

(defn route-fn-name
  "route fn hook"
  [method route]
  (let [route (if (vector? route) (first route) route)]
    (-> (str (name method) route)
        (str/replace #"/" "_")
        symbol)))

(defn defendpoint
  [arg]
  (letfn [(update-defendpoint [node]
            (let [[_defendpoint method route & body] (:children node)]
              (api/list-node
               (list
                (api/token-node 'do)
                (api/token-node (symbol "compojure.core" (str (api/sexpr method))))
                (-> (api/list-node
                     (list*
                      (api/token-node 'clojure.core/defn)
                      (api/token-node (route-fn-name (api/sexpr method) (api/sexpr route)))
                      body))
                    (with-meta (meta node)))))))]
    (update arg :node update-defendpoint)))

(comment
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
      defendpoint
      :node
      api/sexpr))
