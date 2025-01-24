(ns metabase.api.macros-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.macros :as api.macros]))

(deftest ^:parallel parse-args-test
  (are [args expected] (= expected
                          (#'api.macros/parse-defendpoint-args args))
    '(:post "/move"
            "Moves a number of Cards to a single collection or dashboard."
            [_route-params
             _query-params]
            (neat!))
    '{:method :post
      :route {:path "/move"}
      :docstr "Moves a number of Cards to a single collection or dashboard."
      :params {:route {:binding _route-params}, :query {:binding _query-params}}
      :body [(neat!)]}

    '(:post "/move"
            "Moves a number of Cards to a single collection or dashboard."
            [_route-params
             _query-params
             {:keys [card_ids], :as body} :- [:map
                                              [:card_ids [:sequential ms/PositiveInt]]]
             request :- [:map
                         [:form-params :map]]]
            (neat!))
    '{:method :post
      :route {:path "/move"}
      :docstr "Moves a number of Cards to a single collection or dashboard."
      :params {:route   {:binding _route-params}
               :query   {:binding _query-params}
               :body    {:binding {:keys [card_ids], :as body}
                         :schema [:map [:card_ids [:sequential ms/PositiveInt]]]}
               :request {:binding request
                         :schema [:map [:form-params :map]]}}
      :body [(neat!)]}

    ;; async
    '(:post "/move"
            [_route-params
             _query-params
             {:keys [card_ids], :as body} :- :map
             _request
             respond
             raise]
            (try
              (respond (wow!))
              (catch Throwable e
                (raise e))))
    '{:method :post
      :route  {:path "/move"}
      :params {:route   {:binding _route-params}
               :query   {:binding _query-params}
               :body    {:binding {:keys [card_ids], :as body}, :schema :map}
               :request {:binding _request}
               :respond {:binding respond}
               :raise   {:binding raise}}
      :body [(try
               (respond (wow!))
               (catch Throwable e (raise e)))]}))
