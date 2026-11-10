(ns metabase.actions.http-test
  (:require
   [clojure.test :refer :all]
   [metabase.actions.http :as actions.http]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [ring.adapter.jetty :as jetty])
  (:import
   (org.eclipse.jetty.server Server)))

(set! *warn-on-reflection* true)

(def ^:private discount-action
  {:type         :http
   :name         "Request discount"
   :parameters   [{:id "p1" :slug "deal_id" :type :number/=}
                  {:id "p2" :slug "reason" :type :string/=}
                  {:id "p3" :slug "tags" :type :string/=}]
   :method       "POST"
   :url          "https://crm.example.com/deals/{{deal_id}}[[/{{reason}}]]"
   :query_params {"q" "{{reason}}" "source" "app-{{deal_id}}"}
   :headers      {"X-Deal" "{{deal_id}}"}
   :body         {"deal"   "{{deal_id}}"
                  "reason" "{{reason}}"
                  "note"   "Deal {{deal_id}}"
                  "tags"   ["{{tags}}" "fixed"]}})

(defn- request
  "The request of `action` with `values`, its body decoded."
  [action values]
  (update (actions.http/request action values) :body json/decode))

(deftest ^:parallel request-fills-templates-test
  (testing "a lone placeholder keeps its value's type in the body, and URL values are encoded"
    (is (= {:method       :post
            :url          "https://crm.example.com/deals/42/a%2Fb%20c"
            :query-params {"q" "a/b c" "source" "app-42"}
            :headers      {"X-Deal" "42"}
            :accept       :json
            :content-type :json
            :body         {"deal" 42 "reason" "a/b c" "note" "Deal 42" "tags" [["x" "y"] "fixed"]}}
           (request discount-action {"deal_id" 42 "reason" "a/b c" "tags" ["x" "y"]})))))

(deftest ^:parallel request-missing-values-test
  (testing "missing values drop optional blocks, query parameters and body entries"
    (is (=? {:url          "https://crm.example.com/deals/42"
             :query-params {"source" "app-42"}
             :body         {"deal" 42 "note" "Deal 42" "tags" [nil "fixed"]}}
            (request discount-action {"deal_id" 42 "reason" nil}))))
  (testing "a missing value outside an optional block is a 400"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Missing values for deal_id"
                          (request discount-action {})))))

(deftest ^:parallel check-http-action-test
  (testing "every placeholder names a parameter's slug"
    (is (nil? (actions.http/check-http-action discount-action))))
  (testing "a placeholder naming no parameter's slug is a 400"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"No parameter has the slug p1, unknown"
                          (actions.http/check-http-action
                           (assoc discount-action :body {"a" ["{{unknown}}" {"b" "{{p1}}"}]}))))))

(defn do-with-server
  "Calls `f` with the URL of a local server that answers with `handler` and with an atom of the requests it got."
  [handler f]
  (let [requests       (atom [])
        ^Server server (jetty/run-jetty (fn [req]
                                          (swap! requests conj (update req :body slurp))
                                          (handler req))
                                        {:port 0 :join? false})]
    (try
      (f (str "http://localhost:" (.. server getURI getPort)) requests)
      (finally
        (.stop server)))))

(defn json-response
  "A response with `status` and the JSON of `body`."
  [status body]
  {:status  status
   :headers {"Content-Type" "application/json"}
   :body    (json/encode body)})

(deftest send-test
  (mt/with-temp-env-var-value! [mb-http-action-allowed-networks "allow-all"]
    (do-with-server
     (fn [{:keys [uri]}]
       (case uri
         "/ok"       (json-response 201 {"id" 7})
         "/invalid"  (json-response 422 {"error" "Bad discount"})
         "/redirect" {:status 302 :headers {"Location" "/ok"}}))
     (fn [url requests]
       (testing "a 2xx response returns its status and decoded body"
         (is (= {:response-status 201 :response-body {"id" 7}}
                (actions.http/send! (actions.http/request (assoc discount-action :url (str url "/ok"))
                                                          {"deal_id" 42 "reason" "big"}))))
         (is (=? {:request-method :post
                  :uri            "/ok"
                  :query-string   "q=big&source=app-42"
                  :headers        {"x-deal" "42"}}
                 (last @requests)))
         (is (=? {"deal" 42 "reason" "big"}
                 (json/decode (:body (last @requests))))))
       (testing "a response that isn't 2xx is a 502 with its status and body"
         (is (=? {:status-code 502 :response-status 422 :response-body {"error" "Bad discount"}}
                 (try
                   (actions.http/send! {:method :post :url (str url "/invalid")})
                   (catch clojure.lang.ExceptionInfo e (ex-data e))))))
       (testing "a redirect is not followed"
         (is (=? {:status-code 502 :response-status 302}
                 (try
                   (actions.http/send! {:method :get :url (str url "/redirect")})
                   (catch clojure.lang.ExceptionInfo e (ex-data e)))))))))
  (testing "the network policy refuses a local host by default"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"host is not allowed"
                          (actions.http/send! {:method :get :url "http://localhost:1/ok"})))))
