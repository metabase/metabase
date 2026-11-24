(ns metabase.server.middleware.preview-test
  (:require
   [clojure.test :refer :all]
   [metabase.server.middleware.preview :as mw.preview]))

(set! *warn-on-reflection* true)

(defn- handle
  "The outcome of `request` through the middleware: `:passed`, or the ex-data of the refusal."
  [request]
  (let [outcome (atom nil)]
    ((mw.preview/refuse-unless-reading (fn [_request _respond _raise] (reset! outcome :passed)))
     request identity #(reset! outcome (ex-data %)))
    @outcome))

(deftest ^:parallel requests-without-a-preview-pass-test
  (testing "a write that carries no preview token passes untouched"
    (is (= :passed (handle {:request-method :post, :uri "/api/card"})))))

(deftest ^:parallel preview-reads-pass-test
  (doseq [method [:get :head :options]]
    (testing (str "a " method " passes")
      (is (= :passed (handle {:request-method method, :uri "/api/card/1", :previewing-admin-id 2}))))))

(deftest ^:parallel preview-writes-are-refused-test
  (doseq [[method uri] [[:post "/api/card"]
                        [:put "/api/card/1"]
                        [:delete "/api/card/1"]
                        [:patch "/api/card/1"]
                        [:post "/api/dashboard/1/copy"]
                        [:post "/api/dataset/something-else"]
                        [:post "/api/card/1/query/evil"]
                        [:post "/api/metabot/agent"]]]
    (testing (str method " " uri)
      (is (= {:status-code 403, :error-code "preview-read-only"}
             (handle {:request-method method, :uri uri, :previewing-admin-id 2}))))))

(deftest ^:parallel preview-reading-posts-pass-test
  (doseq [uri ["/api/dataset"
               "/api/dataset/csv"
               "/api/dataset/xlsx"
               "/api/dataset/native"
               "/api/dataset/pivot"
               "/api/dataset/query_metadata"
               "/api/dataset/parameter/values"
               "/api/dataset/parameter/search/foo"
               "/api/dataset/parameter/remapping"
               "/api/card/1/query"
               "/api/card/1/query/json"
               "/api/card/pivot/1/query"
               "/api/dashboard/1/dashcard/2/card/3/query"
               "/api/dashboard/1/dashcard/2/card/3/query/csv"
               "/api/dashboard/pivot/1/dashcard/2/card/3/query"]]
    (testing uri
      (is (= :passed (handle {:request-method :post, :uri uri, :previewing-admin-id 2}))))))

(deftest ^:parallel refused-token-test
  (testing "a request whose preview token is no live preview's is a 401, whatever its method"
    (doseq [method [:get :post]]
      (is (= {:status-code 401, :error-code "preview-token-invalid"}
             (handle {:request-method method, :uri "/api/user/current", :preview-token-refused? true}))))))
