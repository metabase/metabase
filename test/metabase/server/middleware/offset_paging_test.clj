(ns metabase.server.middleware.offset-paging-test
  (:require
   [cheshire.core :as json]
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.server.handler :as handler]
   [metabase.server.middleware.offset-paging :as mw.offset-paging :refer [page-result]]
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
  "Responses from our handlers are InputStreams; this reads the stream into the real body."
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
             :body {"limit"  nil
                    "offset" nil
                    "paged?" false
                    "params" {}}}
            (read-response (handler (ring.mock/request :get "/" {:offset "foo" :limit "bar"})))))))

(deftest page-result-test
  (let [numbers (range 100)]

    (testing "no paging params"
      (is (= numbers (page-result numbers))))

    (testing "offset but no limit"
      (binding [mw.offset-paging/*offset* 10]
        (is (= numbers (page-result numbers)))))

    (testing "limit but no offset"
      (binding [mw.offset-paging/*limit* 5]
        (is (= numbers (page-result numbers)))))

    (testing "With both limit and offset set, it pages results"
      (binding [mw.offset-paging/*limit*  5
                mw.offset-paging/*offset* 10]
        (is (= [10 11 12 13 14] (page-result numbers)))))

    (testing "It handles the end of the sequence"
      (binding [mw.offset-paging/*limit*  5
                mw.offset-paging/*offset* 98]
        (is (= [98 99] (page-result numbers)))))

    (testing "If the offset is out of bounds, it returns an empty seq"
      (binding [mw.offset-paging/*limit*  5
                mw.offset-paging/*offset* 200]
        (is (= [] (page-result numbers)))))))
