(ns metabase.server.middleware.offset-paging-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.request.core :as request]
   [metabase.server.handler :as handler]
   [metabase.util.json :as json]
   [ring.mock.request :as ring.mock]
   [ring.util.response :as response])
  (:import
   (java.io PipedInputStream)))

(defn- handler [request]
  (let [handler  (fn [request respond _]
                   (respond (response/response {:limit  (request/limit)
                                                :offset (request/offset)
                                                :paged? (request/paged?)
                                                :params (:params request)})))
        handler* (#'handler/apply-middleware handler)
        respond  identity
        raise    (fn [e] (throw e))]
    (handler* request respond raise)))

(defn- read-response
  "Responses from our handlers are InputStreams; this reads the stream into the real body."
  [response]
  (update response :body
          (fn [body]
            (if (instance? PipedInputStream body)
              (with-open [r (io/reader body)]
                (json/decode r))
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
             :body {"limit"  nil
                    "offset" nil
                    "paged?" false
                    "params" {}}}
            (read-response (handler (ring.mock/request :get "/" {:offset "foo" :limit "bar"})))))))
