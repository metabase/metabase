(ns hooks.metabase.api.macros
  (:require
   [clj-kondo.hooks-api :as api]
   [clojure.string :as str]
   [hooks.common]))

(defn- validate-route! [route]
  (letfn [(validate-route-string! [route-string]
            (when (and (api/string-node? route-string)
                       (str/includes? (api/sexpr route-string) "_"))
              (api/reg-finding! (assoc (meta route-string)
                                       :message "REST API routes and query params should use kebab-case, not snake_case"
                                       :type    :metabase/validate-defendpoint-route-uses-kebab-case))))]
    (cond
      (api/string-node? route)
      (validate-route-string! route)
      ;; otherwise route is a vector like ["/abc/:d/ :d <regex>]
      (api/vector-node? route)
      (validate-route-string! (first (:children route))))))

(defn defendpoint
  [arg]
  (letfn [(update-defendpoint [node]
            (let [[defendpoint method route & more] (:children node)
                  [result-schema & more] (if (= (api/sexpr (first more)) :-)
                                           (drop 1 more)
                                           (cons nil more))
                  [_docstring & more] (if (api/string-node? (first more))
                                        more
                                        (cons nil more))
                  [metadata & more] (if (api/map-node? (first more))
                                      more
                                      (cons nil more))
                  [params & body] more
                  [bindings schemas] (when (api/vector-node? params)
                                       (loop [bindings [], schemas [], [x y & more] (:children params)]
                                         (cond
                                           (not x)
                                           [bindings schemas]

                                           (= (api/sexpr x) :-)
                                           (recur bindings (conj schemas y) more)

                                           :else
                                           (recur (conj bindings x) schemas (cons y more)))))]
              (validate-route! route)
              (-> (api/list-node
                   (list
                    (api/token-node 'do)
                    defendpoint
                    method
                    route
                    (api/list-node
                     (list*
                      (api/token-node 'do)
                      (filter some? (list* metadata result-schema schemas))))
                    (api/list-node
                     (list*
                      (api/token-node `let)
                      (api/vector-node (into []
                                             cat
                                             [(mapcat (fn [a-binding]
                                                        [a-binding (api/map-node {})])
                                                      (take 4 bindings))
                                              (mapcat (fn [a-binding]
                                                        [a-binding (api/list-node (list
                                                                                   (api/token-node 'clojure.core/constantly)
                                                                                   (api/token-node 'nil)))])
                                                      (drop 4 bindings))]))
                      body))))
                  (with-meta (meta node)))))]
    (update arg :node update-defendpoint)))

(comment
  (defn -defendpoint [form]
    (-> {:node (-> form pr-str api/parse-string)}
        defendpoint
        :node
        api/sexpr))

  (defn x []
    (-defendpoint '(api.macros/defendpoint :get "/:id/syncable_schemas"
                     "Returns a list of all syncable schemas found for the database `id`."
                     [{:keys [id]} :- [:map
                                       [:id ms/PositiveInt]]]
                     (let [db (get-database id)]
                       (api/check-403 (or (:is_attached_dwh db)
                                          (and (mi/can-write? db)
                                               (mi/can-read? db))))
                       (->> db
                            (driver/syncable-schemas (:engine db))
                            (vec)
                            (sort)))))))
