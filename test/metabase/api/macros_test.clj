(ns metabase.api.macros-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.macros :as api.macros]))

(deftest ^:parallel parse-args-test
  (is (= '{:method :post
           :route {:path "/move"}
           :docstr "Moves a number of Cards to a single collection or dashboard."
           :params {:route   {:binding _route-params}
                    :query   {:binding _query-params}
                    :body    {:binding {:keys [card_ids], :as body}
                              :schema [:map [:card_ids [:sequential ms/PositiveInt]]]}
                    :request {:binding request
                              :schema [:map [:form-params :map]]}}
           :body [(api.card/update-card! card-id (select-keys body [:collection_id :dashboard_id]) true)]}
         (#'api.macros/parse-defendpoint-args '(:post "/move"
                                                      "Moves a number of Cards to a single collection or dashboard."
                                                      [_route-params
                                                       _query-params
                                                       {:keys [card_ids], :as body} :- [:map
                                                                                        [:card_ids [:sequential ms/PositiveInt]]]
                                                       request :- [:map
                                                                   [:form-params :map]]]
                                                      (api.card/update-card! card-id (select-keys body [:collection_id :dashboard_id]) true))))))
