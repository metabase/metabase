(ns metabase.server.middleware.offset-paging-test
  (:require [clojure.test :refer :all]
            [metabase.server.middleware.offset-paging :as mw.offset-paging]
            [ring.middleware.keyword-params :refer [wrap-keyword-params]]
            [ring.middleware.params :refer [wrap-params]]
            [ring.mock.request :as ring.mock]
            [ring.util.response :as response]
            [schema.core :as s]))

(defn- handler [request]
  (let [handler (-> (fn [request respond _]
                      (respond (response/response {:limit  mw.offset-paging/*limit*
                                                   :offset mw.offset-paging/*offset*
                                                   :paged? mw.offset-paging/*paged?*
                                                   :params (:params request)})))
                    mw.offset-paging/handle-paging
                    wrap-keyword-params
                    wrap-params)
        respond identity
        raise   (fn [e] (throw e))]
    (handler request respond raise)))

(deftest paging-test
  (testing "no paging params"
    (is (= {:status  200
            :headers {}
            :body    {:limit  @#'mw.offset-paging/default-limit
                      :offset 0
                      :paged? false
                      :params {}}}
           (handler (ring.mock/request :get "/")))))
  (testing "w/ paging params"
    (is (= {:status  200
            :headers {}
            :body    {:limit  100
                      :offset 200
                      :paged? true
                      :params {:whatever "true"}}}
           (handler (ring.mock/request :get "/" {:offset "200", :limit "100", :whatever "true"})))))
  (testing "invalid params"
    (is (schema= {:status  (s/eq 400)
                  :headers s/Any
                  :body {:message #"Error parsing paging parameters.*" s/Keyword s/Any}}
                 (handler (ring.mock/request :get "/" {:offset "abc", :limit "100"}))))))
