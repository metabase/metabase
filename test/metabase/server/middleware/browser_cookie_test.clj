(ns metabase.server.middleware.browser-cookie-test
  (:require
   [clojure.test :refer :all]
   [metabase.server.middleware.browser-cookie :as mw.browser-cookie]
   [ring.mock.request :as ring.mock]
   [ring.util.response :as response])
  (:import
   (java.util UUID)))

(set! *warn-on-reflection* true)

(defn- handler [request]
  ((mw.browser-cookie/ensure-browser-id-cookie
    ;; Return ID in the body so we can verify
    (fn [request respond _] (respond (response/response (str (:browser-id request))))))
   request
   identity
   (fn [e] (throw e))))

(def ^:private browser-id-cookie-name @#'mw.browser-cookie/browser-id-cookie-name)

(def ^:private test-uuid #uuid "092797dd-a82a-4748-b393-697d7bb9ab65")

(deftest existing-cookie
  (testing "do not set DEVICE cookie if one is already present"
    (let [request  (-> (ring.mock/request :get "https://localhost/foo")
                       (assoc :cookies {browser-id-cookie-name {:value test-uuid}}))
          response (handler request)]
      (is (= (str test-uuid) (:body response)))
      (is (nil? (:cookies response))))))

(deftest no-existing-cookie
  (testing "set DEVICE cookie with SameSite=Lax if served over HTTP"
    (let [request    (ring.mock/request :get "http://localhost/foo")
          response   (handler request)
          browser-id (:body response)]
      (is (some? (UUID/fromString browser-id)))
      (is (= {:value     browser-id
              :http-only true
              :path      "/"
              :same-site :lax}
             (-> (get-in response [:cookies browser-id-cookie-name])
                 (dissoc :expires))))))
  (testing "set DEVICE cookie with SameSite=None if served over HTTPS"
    (let [request    (ring.mock/request :get "https://localhost/foo")
          response   (handler request)
          browser-id (:body response)]
      (is (some? (UUID/fromString browser-id)))
      (is (= {:value     browser-id
              :http-only true
              :path      "/"
              :same-site :none
              :secure    true}
             (-> (get-in response [:cookies browser-id-cookie-name])
                 (dissoc :expires)))))))
