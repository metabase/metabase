(ns hooks.metabase.api.macros-test
  (:require
   [clj-kondo.hooks-api :as api]
   [clj-kondo.impl.utils]
   [clojure.test :refer :all]
   [hooks.metabase.api.macros]))

(defn- is-valid-node [x]
  (is (api/node? x))
  (doseq [child (:children x)]
    (is-valid-node child)))

(deftest ^:parallel defendpoint-test
  (letfn [(defendpoint [form]
            (let [node (-> form pr-str api/parse-string)]
              (is-valid-node node)
              (-> {:node node}
                  hooks.metabase.api.macros/defendpoint
                  :node
                  api/sexpr)))]
    (are [form expected] (= expected
                            (defendpoint form))
      '(api.macros/defendpoint :post "/" :- [:map [:collection_id :int]]
         "Create a new [[Timeline]]."
         [_route-params
          _query-params
          {:keys [icon], collection-id :collection_id, :as body} :- [:map
                                                                     [:name    ms/NonBlankString]
                                                                     [:default {:optional true} [:maybe :boolean]]]]
         (body icon)
         (body collection-id))
      '(do
         api.macros/defendpoint
         :post
         "/"
         (do
           [:map [:collection_id :int]]
           [:map
            [:name    ms/NonBlankString]
            [:default {:optional true} [:maybe :boolean]]])
         (clojure.core/let [_route-params {}
                            _query-params {}
                            {:keys [icon], collection-id :collection_id, :as body} {}]
           (body icon)
           (body collection-id)))

      '(api.macros/defendpoint :post "/"
         [_route-params
          _query-params
          body
          request
          respond
          raise]
         (try
           (respond :x)
           (catch Throwable e
             (raise e))))
      '(do
         api.macros/defendpoint
         :post
         "/"
         (do)
         (clojure.core/let [_route-params {}
                            _query-params {}
                            body          {}
                            request       {}
                            respond       (clojure.core/constantly nil)
                            raise         (clojure.core/constantly nil)]
           (try
             (respond :x)
             (catch Throwable e
               (raise e))))))))

(defn- defendpoint [form]
  (hooks.metabase.api.macros/defendpoint
    {:node (-> form pr-str api/parse-string)}))

(defn- defendpoint-warnings
  [form]
  (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/validate-defendpoint-route-uses-kebab-case       {:level :warning}
                                                               :metabase/validate-defendpoint-query-params-use-kebab-case {:level :warning}}}
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (defendpoint form)
    @(:findings clj-kondo.impl.utils/*ctx*)))

(deftest ^:parallel validate-route-kebab-case-test
  (is (=? [{:message "REST API routes and query params should use kebab-case, not snake_case"
            :type    :metabase/validate-defendpoint-route-uses-kebab-case
            :row     pos-int?
            :col     pos-int?}]
          (defendpoint-warnings
            '(api.macros/defendpoint :get "/:id/syncable_schemas" ; snake_case route should trigger a warning
               "Returns a list of all syncable schemas found for the database `id`."
               [{:keys [id]}]
               id)))))

(deftest ^:parallel validate-query-params-kebab-case-test
  (is (=? [{:message "REST API routes and query params should use kebab-case, not snake_case",
            :type    :metabase/validate-defendpoint-query-params-use-kebab-case
            :row     pos-int?
            :col     pos-int?}]
          (defendpoint-warnings
            '(api.macros/defendpoint :get "/:id/syncable-schemas"
               "Returns a list of all syncable schemas found for the database `id`."
               [{:keys [id]}
                {:keys [filter_by]} :- [:map
                                        [:filter_by {:optional true} :string]]]
               id)))))
