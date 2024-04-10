(ns metabase.server.middleware.offset-paging-test
  (:require
   [cheshire.core :as json]
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.server.handler :as handler]
   [metabase.server.middleware.offset-paging :as mw.offset-paging]
   [ring.mock.request :as ring.mock]
   [ring.util.response :as response])
  (:import
   (java.io PipedInputStream)))

(defn- handler [request]
  (let [handler  (fn [request respond _]
                   (respond (response/response {:limit  mw.offset-paging/*limit*
                                                :offset mw.offset-paging/*offset*
                                                :paged? mw.offset-paging/*paged?*
                                                :params (:params request)})))
        handler* (#'handler/apply-middleware handler)
        respond  identity
        raise    (fn [e] (throw e))]
    (handler* request respond raise)))

(defn- read-response
  "Responses from our hanlders are inputstream, this is read the stream into real body."
  [response]
  (update response :body
          (fn [body]
            (if (instance? PipedInputStream body)
              (with-open [r (io/reader body)]
                (json/parse-stream r))
              body))))

(deftest paging-test
  (testing "no paging params"
    (is (=? {:status  200
             :body    {"limit"  nil
                       "offset" nil
                       "paged?" false
                       "params" {}}}
            (read-response (handler (ring.mock/request :get "/"))))))
  (testing "w/ paging params"
    (is (=? {:status  200
             :body    {"limit"  100
                       "offset" 200
                       "paged?" true
                       "params" {"whatever" "true"}}}
            (read-response (handler (ring.mock/request :get "/" {:offset "200", :limit "100", :whatever "true"}))))))
  (testing "w/ non-numeric paging params, paging is disabled"
    (is (=? {:status 200
             :body {"limit" nil
                    "offset" nil
                    "paged?" false
                    "params" {}}}
            (read-response (handler (ring.mock/request :get "/" {:offset "foo" :limit "bar"})))))))
