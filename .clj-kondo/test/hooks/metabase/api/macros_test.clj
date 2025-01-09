(ns hooks.metabase.api.macros-test
  (:require
   [clj-kondo.hooks-api :as api]
   [clojure.test :refer :all]
   [hooks.metabase.api.macros]))

(deftest ^:parallel defendpoint-test
  (let [form '(api.macros/defendpoint :post "/" :- [:map [:collection_id :int]]
                "Create a new [[Timeline]]."
                [_route-params
                 _query-params
                 {:keys [icon], collection-id :collection_id, :as body} :- [:map
                                                                            [:name    ms/NonBlankString]
                                                                            [:default {:optional true} [:maybe :boolean]]]]
                (body icon)
                (body collection-id))
        node (-> form pr-str api/parse-string)]
    (is (= '(do
              api.macros/defendpoint
              :post
              "/"
              (do
                [:map [:collection_id :int]]
                [:map
                 [:name    ms/NonBlankString]
                 [:default {:optional true} [:maybe :boolean]]])
              (clojure.core/let [_route-params nil
                                 _query-params nil
                                 {:keys [icon], collection-id :collection_id, :as body} nil]
                (body icon)
                (body collection-id)))
           (-> {:node node}
               hooks.metabase.api.macros/defendpoint
               :node
               api/sexpr)))))
