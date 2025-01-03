(ns metabase.channel.impl.http-test
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [compojure.core :as compojure]
   [compojure.route :as compojure.route]
   [metabase.channel.core :as channel]
   [metabase.notification.test-util :as notification.tu]
   [metabase.pulse.send :as pulse.send]
   [metabase.server.handler :as server.handler]
   [metabase.server.middleware.json :as mw.json]
   [metabase.test :as mt]
   [metabase.util.i18n :refer [deferred-tru]]
   [ring.adapter.jetty :as jetty]
   [ring.middleware.params :refer [wrap-params]]
   [toucan2.core :as t2])
  (:import
   (org.eclipse.jetty.server Server)))

(set! *warn-on-reflection* true)

(comment
  server.handler/keepme)

(defn do-with-captured-http-requests
  [f]
  (let [requests (atom [])]
    (binding [http/request (fn [req]
                             (swap! requests conj req)
                             ::noop)]
      (f requests))))

(defmacro ^:private with-captured-http-requests
  [[requests-binding] & body]
  `(do-with-captured-http-requests
    (fn [~requests-binding]
      ~@body)))

(def ^:private default-request
  {:accept       :json
   :content-type :json})

(defn apply-middleware
  [handler middlewares]
  (reduce
   (fn [handler middleware-fn]
     (middleware-fn handler))
   handler
   middlewares))

(def middlewares [mw.json/wrap-json-body
                  mw.json/wrap-streamed-json-response
                  wrap-params])

(defn do-with-server
  [route+handlers f]
  (let [handler        (as-> route+handlers routes+handlers
                         (mapv :route routes+handlers)
                         (conj routes+handlers (compojure.route/not-found {:status-code 404 :body "Not found."}))
                         (apply compojure/routes routes+handlers))
        ^Server server (jetty/run-jetty (apply-middleware handler middlewares) {:port 0 :join? false})]
    (try
      (f (str "http://localhost:" (.. server getURI getPort)))
      (finally
        (.stop server)))))

(defn make-route
  "Create a route to be used with [[with-server]].

  (make-route :get \"/test\" (fn [req] {:status 200 :body \"Hello, world!\"}))"
  [method path handler]
  {:path  path
   :route (compojure/make-route method path handler)})

(defmacro with-server
  "Create a temporary server given a list of routes and handlers, and execute the body
  with the server URL binding.

  (with-server [url [(make-route :get (identity {:status 200}))] & handlers]
  (http/get (str url \"/test_http_channel_200\"))"
  [[url-binding handlers] & body]
  `(do-with-server
    ~handlers
    (fn [~url-binding]
      ~@body)))

(def get-favicon
  (make-route :get "/favicon.ico"
              (fn [_]
                {:status 200
                 :body   "Favicon"})))

(def get-200
  (make-route :get "/test_http_channel_200"
              (fn [_]
                {:status 200
                 :body   "Hello, world!"})))

(def post-200
  (make-route :post "/test_http_channel_200"
              (fn [_]
                {:status 200
                 :body   "Hello, world!"})))

(def get-302-redirect-200
  (make-route :get "/test_http_channel_302_redirect_200"
              (fn [_]
                {:status  302
                 :headers {"Location" (:path get-200)}})))

(def get-400
  (make-route :get "/test_http_channel_400"
              (fn [_]
                {:status 400
                 :body   "Bad request"})))

(def post-400
  (make-route :post "/test_http_channel_400"
              (fn [_]
                {:status 400
                 :body   "Bad request"})))

(def get-302-redirect-400
  (make-route :get "/test_http_channel_302_redirect_400"
              (fn [_]
                {:status  302
                 :headers {"Location" (:path get-400)}})))

(def get-500
  (make-route :get "/test_http_channel_500"
              (fn [_]
                {:status 500
                 :body   "Internal server error"})))

(defn can-connect?
  [details]
  (channel/can-connect? :channel/http details))

(defmacro exception-data
  [& body]
  `(try
     ~@body
     (catch Exception e#
       (ex-data e#))))

(deftest ^:parallel can-connect-no-auth-test
  (with-server [url [get-favicon get-200 get-302-redirect-200 get-400 get-302-redirect-400 get-500]]
    (let [can-connect?* (fn [route]
                          (can-connect? {:url         (str url (:path route))
                                         :auth-method "none"
                                         :method      "get"}))]

      (testing "connect successfully with 200"
        (is (true? (can-connect?* get-200))))
      (testing "connect successfully with 302 redirect to 200"
        (is (true? (can-connect?* get-302-redirect-200))))
      (testing "failed to connect with a 302 that redirects to 400"
        (is (= {:request-status 400
                :request-body   "Bad request"}
               (exception-data (can-connect?* get-302-redirect-400)))))
      (testing "failed to conenct to a 400"
        (is (= {:request-status 400
                :request-body   "Bad request"}
               (exception-data (can-connect?* get-400)))))
      (is (=? {:request-status 500
               :request-body   "Internal server error"}
              (exception-data (can-connect?* get-500)))))))

(deftest ^:parallel can-connect-header-auth-test
  (with-server [url [(make-route :get "/user"
                                 (fn [x]
                                   (if (= "SECRET" (get-in x [:headers "x-api-key"]))
                                     {:status 200
                                      :body   "Hello, world!"}
                                     {:status 401
                                      :body   "Unauthorized"})))]]
    (testing "connect successfully with header auth"
      (is (true? (can-connect? {:url         (str url "/user")
                                :method      "get"
                                :auth-method "header"
                                :auth-info   {:x-api-key "SECRET"}}))))

    (testing "fail to connect with header auth"
      (is (= {:request-status 401
              :request-body   "Unauthorized"}
             (exception-data (can-connect? {:url         (str url "/user")
                                            :method      "get"
                                            :auth-method "header"
                                            :auth-info   {:x-api-key "WRONG"}})))))))

(deftest ^:parallel can-connect-query-param-auth-test
  (with-server [url [(make-route :get "/user"
                                 (fn [x]
                                   (if (= ["qnkhuat" "secretpassword"]
                                          [(get-in x [:query-params "username"]) (get-in x [:query-params "password"])])
                                     {:status 200
                                      :body   "Hello, world!"}
                                     {:status 401
                                      :body   "Unauthorized"})))]]
    (testing "connect successfully with query-param auth"
      (is (true? (can-connect? {:url         (str url "/user")
                                :method      "get"
                                :auth-method "query-param"
                                :auth-info   {:username "qnkhuat"
                                              :password "secretpassword"}}))))
    (testing "fail to connect with query-param auth"
      (is (= {:request-status 401
              :request-body   "Unauthorized"}
             (exception-data (can-connect? {:url         (str url "/user")
                                            :method      "get"
                                            :auth-method "query-param"
                                            :auth-info   {:username "qnkhuat"
                                                          :password "wrongpassword"}})))))))

(deftest ^:parallel can-connect-request-body-auth-test
  (with-server [url [(make-route :post "/user"
                                 (fn [x]
                                   (if (= "SECRET_TOKEN" (get-in x [:body :token]))
                                     {:status 200
                                      :body   "Hello, world!"}
                                     {:status 401
                                      :body   "Unauthorized"})))]]
    (testing "connect successfully with request-body auth"
      (is (true? (can-connect? {:url         (str url "/user")
                                :method      "post"
                                :auth-method "request-body"
                                :auth-info   {:token "SECRET_TOKEN"}}))))
    (testing "fail to connect with request-body auth"
      (is (= {:request-status 401
              :request-body   "Unauthorized"}
             (exception-data (can-connect? {:url         (str url "/user")
                                            :method      "post"
                                            :auth-method "request-body"
                                            :auth-info   {:token "WRONG_TOKEN"}})))))))

(deftest ^:parallel can-connect?-errors-test
  (testing "throws an appriopriate errors if details are invalid"
    (testing "invalid url"
      (is (= {:errors {:url [(deferred-tru "value must be a valid URL.")]}}
             (exception-data (can-connect? {:url         "not-an-url"
                                            :auth-method "none"})))))

    (testing "testing missing auth-method"
      (is (= {:errors {:auth-method ["missing required key"]}}
             (exception-data (can-connect? {:url "https://www.secret_service.xyz"})))))

    (testing "include undefined key"
      (is (=? {:errors {:xyz ["disallowed key"]}}
              (exception-data (can-connect? {:xyz "hello world"})))))

    (with-server [url [get-400]]
      (is (= {:request-body   "Bad request"
              :request-status 400}
             (exception-data (can-connect? {:url         (str url (:path get-400))
                                            :method      "get"
                                            :auth-method "none"})))))

    (with-server [url [(make-route :get "/test_http_channel_400"
                                   (fn [_]
                                     {:status 400
                                      :body   {:message "too bad"}}))]]
      (testing "attempt to json parse the response body if it's a string"
        (is (= {:request-body   {"message" "too bad"}
                :request-status 400}
               (exception-data (can-connect? {:url         (str url (:path get-400))
                                              :method      "get"
                                              :auth-method "none"}))))))))

(deftest ^:parallel send!-test
  (testing "basic send"
    (with-captured-http-requests [requests]
      (channel/send! {:type        :channel/http
                      :details     {:url         "https://www.secret_service.xyz"
                                    :auth-method "none"
                                    :method      "get"}}
                     nil)
      (is (= (merge default-request
                    {:method       :get
                     :url          "https://www.secret_service.xyz"})
             (first @requests)))))

  (testing "default method is post"
    (with-captured-http-requests [requests]
      (channel/send! {:type    :channel/http
                      :details {:url         "https://www.secret_service.xyz"
                                :auth-method "none"}}
                     nil)
      (is (= (merge default-request
                    {:method       :post
                     :url          "https://www.secret_service.xyz"})
             (first @requests)))))

  (testing "preserves req headers when use auth-method=:header"
    (with-captured-http-requests [requests]
      (channel/send! {:type    :channel/http
                      :details {:url         "https://www.secret_service.xyz"
                                :auth-method "header"
                                :auth-info   {:Authorization "Bearer 123"}
                                :method      "get"}}
                     {:headers     {:X-Request-Id "123"}})
      (is (= (merge default-request
                    {:method  :get
                     :url          "https://www.secret_service.xyz"
                     :headers      {:Authorization "Bearer 123"
                                    :X-Request-Id "123"}})
             (first @requests)))))

  (testing "preserves req query-params when use auth-method=:query-param"
    (with-captured-http-requests [requests]
      (channel/send! {:type    :channel/http
                      :details {:url         "https://www.secret_service.xyz"
                                :auth-method "query-param"
                                :auth-info   {:token "123"}
                                :method      "get"}}
                     {:query-params {:page 1}})
      (is (= (merge default-request
                    {:method       :get
                     :url          "https://www.secret_service.xyz"
                     :query-params {:token "123"
                                    :page 1}})
             (first @requests))))))

(deftest ^:parallel alert-http-channel-e2e-test
  (let [received-message (atom nil)
        receive-route    (make-route :post "/test_http_channel"
                                     (fn [res]
                                       (reset! received-message res)
                                       {:status 200}))]
    (notification.tu/with-send-notification-sync
      (with-server [url [receive-route]]
        (mt/with-temp
          [:model/Card         {card-id :id
                                :as card}     {:dataset_query (mt/mbql-query checkins {:aggregation [:count]})}
           :model/Pulse        {pulse-id :id
                                :as pulse}    {:alert_condition "rows"}
           :model/PulseCard    _              {:pulse_id        pulse-id
                                               :card_id         card-id
                                               :position        0}
           :model/Channel      {chn-id :id}  {:type    :channel/http
                                              :details {:url         (str url (:path receive-route))
                                                        :auth-method "none"}}
           :model/PulseChannel _             {:pulse_id     pulse-id
                                              :channel_type "http"
                                              :channel_id   chn-id}]
          (pulse.send/send-pulse! (t2/select-one :model/Pulse pulse-id))
          (is (=? {:body {:type               "alert"
                          :alert_id           pulse-id
                          :alert_creator_id   (mt/malli=? int?)
                          :alert_creator_name (t2/select-one-fn :common_name :model/User (:creator_id pulse))
                          :data               {:type          "question"
                                               :question_id   card-id
                                               :question_name (:name card)
                                               :question_url  (mt/malli=? [:fn #(str/ends-with? % (str card-id))])
                                               :visualization (mt/malli=? [:fn #(str/starts-with? % "data:image/png;base64")])
                                               :raw_data      {:cols ["count"] :rows [[1000]]}}
                          :sent_at            (mt/malli=? :any)}}
                  @received-message)))))))
