(ns hooks.metabase.api.macros
  (:require
   [clj-kondo.hooks-api :as api]
   [clojure.string :as str]))

(defn- validate-route!
  "Make sure the route uses kebab-case rather than snake_case."
  [route]
  (letfn [(validate-route-string! [route-string]
            (when (and (api/string-node? route-string)
                       (str/includes? (api/sexpr route-string) "_"))
              (api/reg-finding! (assoc (meta route-string)
                                       :message "REST API routes and query params should use kebab-case, not snake_case"
                                       :type    :metabase/validate-defendpoint-route-uses-kebab-case))))]
    (cond
      (api/string-node? route)
      (validate-route-string! route)
      ;; otherwise route is a vector like ["/abc/:d/" :d <regex>]
      (api/vector-node? route)
      (validate-route-string! (first (:children route))))))

(defn- validate-query-params!
  "Make sure query params use kebab-case rather than snake_case.

  This only works on inline schemas for now. If you define the schema elsewhere then we'd have to implement this
  validation in Clojure-land since we can't resolve the schemas in Kondo. It should however still work on complicated
  schemas like

    [:merge <map-1> <map-2>]"
  [query-param-schema-node]
  (letfn [(map-schema? [node]
            (and (api/vector-node? node)
                 (when-let [first-child (first (:children node))]
                   (and (api/keyword-node? first-child)
                        (= (api/sexpr first-child) :map)))))
          (map-schema-keys [{:keys [children], :as _node}]
            (let [child-schemas (if (api/map-node? (second children))
                                  (drop 2 children)
                                  (drop 1 children))]
              (keep (fn [child-schema]
                      (when (api/vector-node? child-schema)
                        (when-let [k (first (:children child-schema))]
                          (when (api/keyword-node? k)
                            k))))
                    child-schemas)))
          (validate-map-schema! [form]
            ;; only warn once per endpoint -- just once on the first bad node
            (when-let [bad-node (some (fn [key-node]
                                        (when (str/includes? (str (api/sexpr key-node)) "_")
                                          key-node))
                                      (map-schema-keys form))]
              (api/reg-finding! (assoc (meta bad-node)
                                       :message "REST API routes and query params should use kebab-case, not snake_case"
                                       :type    :metabase/validate-defendpoint-query-params-use-kebab-case))))
          (validate! [node]
            (cond
              (and (api/vector-node? node)
                   (map-schema? node))
              (validate-map-schema! node)

              (api/vector-node? node)
              (doseq [child (:children node)]
                (validate! child))))]
    (validate! query-param-schema-node)))

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
                                       (loop [bindings [], schemas [], [x y z & more] (:children params)]
                                         (cond
                                           (not x)
                                           [bindings schemas]

                                           (and (api/keyword-node? y)
                                                (= (api/sexpr y) :-))
                                           (recur (conj bindings x) (conj schemas z) more)

                                           :else
                                           (recur (conj bindings x) (conj schemas nil) (list* y z more)))))]
              (validate-route! route)
              (when-not result-schema
                (api/reg-finding! (assoc (meta node)
                                         :message "All REST API endpoints should have a detailed response schema"
                                         :type    :metabase/validate-defendpoint-has-response-schema)))
              (let [[_route-param-schema query-param-schema _body-param-schema] schemas]
                (when query-param-schema
                  (validate-query-params! query-param-schema)))
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
    (-defendpoint '(api.macros/defendpoint :get "/:id/syncable_schemas" ; snake_case route should trigger a warning
                     "Returns a list of all syncable schemas found for the database `id`."
                     [{:keys [id]} :- [:map
                                       [:id ms/PositiveInt]]
                      ;; snake_case query parameter, should trigger a warning
                      {:keys [filter_by]} :- [:map
                                              [:filter_by {:optional true} :string]]]
                     (let [db (get-database id)]
                       (api/check-403 (or (:is_attached_dwh db)
                                          (and (mi/can-write? db)
                                               (mi/can-read? db))))
                       (->> db
                            (driver/syncable-schemas (:engine db))
                            (vec)
                            (sort)))))))
