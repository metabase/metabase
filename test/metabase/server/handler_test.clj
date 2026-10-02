(ns metabase.server.handler-test
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.http-handler :as mcp.http-handler]
   [metabase.server.handler :as server.handler]
   [metabase.test.fixtures :as fixtures]
   [metabase.tiles.settings]))

;; The security middleware reads `map-tile-server-url`, which this namespace defines.
(comment metabase.tiles.settings/keep-me)

(use-fixtures :once (fixtures/initialize :db))

(defn- cors-options [origin]
  (assoc mcp.http-handler/options :cors {:origins-fn         (constantly origin)
                                         :sandbox-origin?-fn (constantly false)}))

(def ^:private options
  (cors-options "https://a.example"))

(defn- allowed-origin [handler origin]
  (let [response (promise)]
    (handler {:request-method :get, :uri "/api/anything", :headers {"origin" origin}}
             #(deliver response %)
             #(deliver response %))
    (get-in (deref response 10000 ::timed-out) [:headers "Access-Control-Allow-Origin"])))

(deftest dev-handler-rebuilds-when-options-var-changes-test
  (let [handler (#'server.handler/dev-handler (fn [_request respond _raise]
                                                (respond {:status 200, :headers {}, :body "ok"}))
                                              #'options)]
    (is (= "https://a.example" (allowed-origin handler "https://a.example")))
    (with-redefs [options (cors-options "https://b.example")]
      (is (= "https://b.example" (allowed-origin handler "https://b.example")))
      (is (nil? (allowed-origin handler "https://a.example"))))))

(deftest handler-options-require-credential-fns-test
  ;; `make-handler` checks this explicitly, since its `mu/defn` schema is not checked in prod.
  (doseq [k [:oauth-bearer]]
    (testing k
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"does not match schema"
                            (#'server.handler/current-options (dissoc mcp.http-handler/options k)))))))
