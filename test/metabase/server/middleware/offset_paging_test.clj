(ns metabase.server.middleware.offset-paging-test
  (:require
   [cheshire.core :as json]
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.server.handler :as handler]
   [metabase.server.middleware.offset-paging :as mw.offset-paging]
   [metabase.server.middleware.security :as mw.security]
   [metabase.test :as mt]
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
  ;; set the system clock here so this doesn't flake if we cross the second boundary between evaluating the expected
  ;; form and the actual form
  (mt/with-clock #t "2023-02-20T15:01:00-08:00[US/Pacific]"
    (testing "invalid params"
      (is (=? {:status  400
               :headers (mw.security/security-headers)
               :body    {"message" #"Error parsing paging parameters.*"}}
              (read-response (handler (ring.mock/request :get "/" {:offset "abc", :limit "100"}))))))))
