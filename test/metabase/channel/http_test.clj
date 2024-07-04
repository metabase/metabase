(ns metabase.channel.http-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.channel.core :as channel]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.urls :as urls]
   [metabase.util.secret :as u.secret]
   [metabase.test :as mt]))

(def ^{:private true
       :dynamic true}
  *requests*
  nil)

(defn do-with-captured-http-requests
  [f]
  (let [*requests*' (atom [])]
    (binding [*requests*  *requests*'
              http/request (fn [req]
                             (swap! *requests* conj req))]
      (f))))

(defmacro ^:private with-captured-http-requests
  [& body]
  `(do-with-captured-http-requests
    (fn []
      ~@body)))

(def ^:private default-request
  {:accept       :json
   :content-type :json})

(deftest can-connect-with-api-key-test
  (mt/test-helpers-set-global-values!
    (mt/with-temp [:model/ApiKey _ {:name          "A superuser API Key"
                                    :user_id       (mt/user->id :crowberto)
                                    :creator_id    (mt/user->id :lucky)
                                    :updated_by_id (mt/user->id :lucky)
                                    :unhashed_key  (u.secret/secret "mb_superuser")}]
      (is (true? (channel/can-connect? :channel/http {:url         (str (urls/site-url) "/api/user/current")
                                                      :auth-method :header
                                                      :auth-info   {:x-api-key "mb_superuser"}
                                                      :method      :get}))))))

(deftest ^:parallel can-connect-request-test
  (testing "Can connect without auth"
    (with-captured-http-requests
      (is (true? (channel/can-connect? :channel/http {:url         "https://www.secret_service.xyz"
                                                      :auth-method :none
                                                      :method      :post})))
      (is (= (merge default-request
                    {:method :post
                     :url    "https://www.secret_service.xyz"})
             (first @*requests*)))))

  (testing "Can connect with header auth"
    (with-captured-http-requests
      (is (true? (channel/can-connect? :channel/http {:url         "https://www.secret_service.xyz"
                                                      :auth-method :header
                                                      :auth-info   {:Authorization "Bearer 123"}
                                                      :method      :post})))
      (is (= (merge default-request
                    {:method :post
                     :url    "https://www.secret_service.xyz"
                     :headers {:Authorization "Bearer 123"}})
             (first @*requests*)))))

  (testing "Can connect with query-param auth"
    (with-captured-http-requests
      (is (true? (channel/can-connect? :channel/http {:url         "https://www.secret_service.xyz"
                                                      :auth-method :query-param
                                                      :auth-info   {:token "123"}
                                                      :method      :post})))
      (is (= (merge default-request
                    {:method       :post
                     :url          "https://www.secret_service.xyz"
                     :query-params {:token "123"}})
             (first @*requests*))))))

(defmacro exception-data
  [& body]
  `(try
     ~@body
     (catch Exception e#
       (ex-data e#))))

(deftest ^:parallel can-connect?-errors-test
  (testing "throws an appriopriate errors if details are mismatched"
    (is (= {:errors {:url [(deferred-tru "value must be a valid URL.")]}}
           (exception-data (channel/can-connect? :channel/http {:url         "not-an-url"
                                                                :auth-method :none}))))
    (is (= {:errors {:auth-method ["missing required key"]}}
           (exception-data (channel/can-connect? :channel/http {:url "https://www.secret_service.xyz"}))))

    (is (= {:request-body "\"API endpoint does not exist.\""
            :request-status 404}
           (exception-data (channel/can-connect? :channel/http {:url         (str (urls/site-url) "/api/not-exists")
                                                                :method      :get
                                                                :auth-method :none}))))))

(deftest returns-300-test)

(deftest ^:parallel send!-test
  (testing "basic send"
    (with-captured-http-requests
      (channel/send! {:type        :channel/http
                      :url         "https://www.secret_service.xyz"
                      :auth-method :none
                      :method      :get}
                     nil)
      (is (= (merge default-request
                    {:method       :get
                     :url          "https://www.secret_service.xyz"})
             (first @*requests*)))))

  (testing "preserves req headers when use auth-method=:header"
    (with-captured-http-requests
      (channel/send! {:type        :channel/http
                      :url         "https://www.secret_service.xyz"
                      :auth-method :header
                      :auth-info   {:Authorization "Bearer 123"}
                      :method      :get}
                     {:headers     {:X-Request-Id "123"}})
      (is (= (merge default-request
                    {:method       :get
                     :url          "https://www.secret_service.xyz"
                     :headers      {:Authorization "Bearer 123"
                                    :X-Request-Id "123"}})
             (first @*requests*)))))

  (testing "preserves req query-params when use auth-method=:query-param"
    (with-captured-http-requests
      (channel/send! {:type        :channel/http
                      :url         "https://www.secret_service.xyz"
                      :auth-method :query-param
                      :auth-info   {:token "123"}
                      :method      :get}
                     {:query-params {:page 1}})
      (is (= (merge default-request
                    {:method       :get
                     :url          "https://www.secret_service.xyz"
                     :query-params {:token "123"
                                    :page 1}})
             (first @*requests*))))))
