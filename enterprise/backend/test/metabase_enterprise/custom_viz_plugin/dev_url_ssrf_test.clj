(ns ^:synchronous metabase-enterprise.custom-viz-plugin.dev-url-ssrf-test
  "SEC-769: the custom-viz-plugin dev endpoints fetch a caller-supplied URL, and did so through raw `clj-http`
   validated by scheme alone. There are two sinks and two defenses, one test each -- `POST /dev` (cache.clj)
   must refuse a host that resolves to an internal address, and the dev-sse proxy (api.clj) must not follow a
   redirect off the host that was checked. Both drive real loopback servers instead of stubbing `http/get`,
   which is how these sinks went uncovered to begin with."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.settings :as custom-viz.settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.http :as u.http]
   [ring.adapter.jetty :as ring-jetty])
  (:import
   (java.net InetAddress)
   (org.apache.http.impl.conn InMemoryDnsResolver)
   (org.eclipse.jetty.server Server)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(use-fixtures :each
  (fn [thunk]
    (mt/with-temporary-setting-values [csp-img-enabled    true
                                       custom-viz-enabled true]
      (thunk))))

(defmacro ^:private with-dev-mode-enabled [& body]
  `(with-redefs [custom-viz.settings/custom-viz-plugin-dev-mode-enabled (constantly true)]
     ~@body))

(defprotocol DevServer
  (-port [_] "The ephemeral port this server bound to.")
  (-paths [_] "Request paths this server has received, in arrival order."))

(defn- recording-server
  "An HTTP server on an ephemeral loopback port that records the path of every request it receives and answers
   each one by calling `handler`. Closeable, for use with `with-open`."
  ^java.io.Closeable [handler]
  (let [received       (atom [])
        ^Server server (ring-jetty/run-jetty (fn [request]
                                               (swap! received conj (:uri request))
                                               (handler request))
                                             {:join? false, :port 0})]
    (reify
      java.io.Closeable
      (close [_] (.stop server))

      DevServer
      (-port [_] (.. server getURI getPort))
      (-paths [_] @received))))

(defn- base-url [server]
  (str "http://127.0.0.1:" (-port server)))

(deftest dev-registration-refuses-internal-address-test
  (testing "POST /dev refuses a dev URL whose host resolves to the cloud metadata service (sink: cache.clj)"
    (mt/with-premium-features #{:custom-viz}
      (with-dev-mode-enabled
        (mt/with-model-cleanup [:model/CustomVizPlugin]
          ;; the injected resolver only takes effect once the fetch runs through
          ;; `u.http/network-policy-dns-resolver`, which is the point of testing it this way: it pins the sink
          ;; to the shared policy rather than to any check it might roll for itself.
          (binding [u.http/*system-dns-resolver*
                    (doto (InMemoryDnsResolver.)
                      (.add "ssrf-probe.invalid"
                            (into-array [(InetAddress/getByAddress (byte-array [169 254 169 254]))])))]
            (let [resp (mt/user-http-request-full-response :crowberto :post "ee/custom-viz-plugin/dev"
                                                           {:dev_bundle_url "http://ssrf-probe.invalid"})]
              (is (re-find #"(?i)network|not permitted|internal|blocked|address" (str (:body resp)))
                  "the refusal must read differently from an ordinary fetch failure, so it cannot be swallowed
                   by the catch in fetch-dev-manifest"))))))))

(deftest dev-sse-proxy-does-not-follow-redirects-test
  (testing "the dev-sse proxy does not follow a 3xx off the host that was checked (sink: api.clj)"
    (mt/with-premium-features #{:custom-viz}
      (with-dev-mode-enabled
        (with-open [internal (recording-server (fn [_request]
                                                 {:status  200
                                                  :headers {"Content-Type" "text/event-stream"}
                                                  :body    "data: internal\n\n"}))]
          (with-open [redirector (recording-server (fn [_request]
                                                     {:status  302
                                                      :headers {"Location" (str (base-url internal) "/__sse")}
                                                      :body    ""}))]
            (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier     "dev-sse-ssrf"
                                                            :display_name   "dev-sse-ssrf"
                                                            :status         :active
                                                            :dev_bundle_url (base-url redirector)}]
              (mt/user-http-request-full-response :crowberto :get (str "ee/custom-viz-plugin/" id "/dev-sse"))
              (is (seq (-paths redirector))
                  "a loopback dev server is still reached -- the feature keeps working")
              (is (= [] (-paths internal))
                  "the redirect target must never be requested"))))))))
