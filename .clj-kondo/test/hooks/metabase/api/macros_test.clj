(ns hooks.metabase.api.macros-test
  (:require
   [clj-kondo.hooks-api :as api]
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
