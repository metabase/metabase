(ns metabase-enterprise.monitor-relay.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.monitor-relay.client :as relay.client]
   [metabase-enterprise.monitor-relay.cycle :as relay.cycle]
   [metabase-enterprise.monitor-relay.source :as relay.source]
   [metabase.config.core :as config]
   [metabase.test :as mt]
   [metabase.util.json :as json])
  (:import
   (java.net ConnectException)
   (java.time Duration)))

(set! *warn-on-reflection* true)

(def ^:private endpoint "ee/monitor-relay/status")

(def ^:private url "http://monitor:8080/ingest/the-secret-token")

(def ^:private receiver-status
  {:phase        "live"
   :streams      [{:stream "login", :w 9, :sequence 9, :floor 1, :target 7}]
   :last_seal_at "2026-10-28T10:00:00Z"
   :nodes        [{:node_id "n1", :last_sync_at "2026-10-28T10:00:05Z"}]
   :state        [{:kind "user", :pass_age_s 60, :interval_s 86400, :cursor_age_s 4}
                  {:kind "group", :pass_age_s nil, :interval_s 60}]})

(defn- run-cycle!
  "Runs a relay cycle on this node against a receiver that gives `answer` to every post."
  [answer]
  (mt/with-dynamic-fn-redefs [relay.source/sync-report (fn [boot-id] {:boot_id boot-id})
                              relay.client/post!       (fn [& _] answer)]
    (relay.cycle/cycle!)))

(defn- fetch-status!
  "A superuser's GET of the status, while the receiver's `answer` takes the endpoint, the body and the timeout. Returns
  the response and the posts."
  [answer]
  (let [posts (atom [])]
    (mt/with-dynamic-fn-redefs [relay.client/post! (fn [_target endpoint body timeout]
                                                     (swap! posts conj [endpoint body timeout])
                                                     (answer endpoint body timeout))]
      {:response (mt/user-http-request :crowberto :get 200 endpoint)
       :posts    @posts})))

(deftest status-requires-superuser-test
  (mt/with-temp-env-var-value! [mb-metabase-monitor-url url]
    (mt/with-dynamic-fn-redefs [relay.client/post! (fn [& _] (throw (ex-info "never asked" {})))]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 endpoint))))))

(deftest status-test
  (reset! @#'relay.cycle/node nil)
  (mt/with-temp-env-var-value! [mb-metabase-monitor-url url]
    (run-cycle! {:status 200, :body {:streams {}, :state {}}})
    (testing "the URL without its token, this node, and the status that the receiver answers now"
      (let [{:keys [response posts]} (fetch-status! (constantly {:status 200, :body {:status receiver-status}}))]
        (is (=? {:url  {:status "ok", :base "http://monitor:8080"}
                 :node {:node_id      config/local-process-uuid
                        :ran_here     true
                        :last_run_at  #"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z"
                        :last_result  {:outcome "ok", :message "The run had no failure."}
                        :failures     0
                        :paused_until nil}
                 :feed {:at     #"\d{4}-\d\d-\d\dT.*Z"
                        :error  nil
                        :status receiver-status}}
                response))
        (is (= #{:url :node :feed} (set (keys response))))
        (is (not (str/includes? (json/encode response) "the-secret-token")))
        (testing "asked for when the request comes, with an empty body, for 5 s at most"
          (is (= [["status" {} (Duration/ofSeconds 5)]] posts)))))
    (testing "a status with fields this Metabase does not know is shown as it is"
      (let [status (-> receiver-status
                       (assoc :new_field 1)
                       (update-in [:streams 0] assoc :new_field 2))]
        (is (= status (get-in (fetch-status! (constantly {:status 200, :body {:status status}}))
                              [:response :feed :status])))))
    (testing "when the receiver gives no status, or one of another shape: why, and when the relay asked"
      (doseq [[answer error] [[(fn [& _] (throw (ConnectException. "Connection refused")))
                               (str "The relay could not reach Metabase Monitor at http://monitor:8080:"
                                    " ConnectException: Connection refused. It tries again.")]
                              [(constantly {:status 401, :body {:error "unknown token"}})
                               (str "Metabase Monitor at http://monitor:8080 refused the relay's token. The relay tries"
                                    " again in 5 minutes, or when its URL changes.")]
                              [(constantly {:status 200, :body {}})
                               "Metabase Monitor answered no status."]
                              [(constantly {:status 200, :body {:status (dissoc receiver-status :state)}})
                               #"Metabase Monitor answered a status of another shape: .*:state.*"]
                              [(constantly {:status 200, :body {:status (assoc receiver-status :phase "lost")}})
                               #"Metabase Monitor answered a status of another shape: .*:phase.*"]]]
        (let [{:keys [response]} (fetch-status! answer)]
          (is (=? {:feed {:at string?, :error error, :status nil}} response))
          (is (not (str/includes? (json/encode response) "the-secret-token"))))))
    (testing "after a refusal: the reason and the end of the pause"
      (run-cycle! {:status 401, :body {:error "unknown token"}})
      (is (=? {:node {:last_result  {:outcome "refused", :message #".* refused the relay's token\..*"}
                      :failures     1
                      :paused_until string?}}
              (:response (fetch-status! (constantly {:status 401, :body {:error "unknown token"}}))))))))

(deftest status-without-url-test
  (testing "without a URL, the relay asks the receiver nothing"
    (mt/with-temp-env-var-value! [mb-metabase-monitor-url nil]
      (mt/with-temporary-setting-values [metabase-monitor-url nil]
        (let [{:keys [response posts]} (fetch-status! (fn [& _] (throw (ex-info "never asked" {}))))]
          (is (= [] posts))
          (is (=? {:url  {:status "unset", :base nil}
                   :feed {:at nil, :error nil, :status nil}}
                  response)))))))

(deftest status-malformed-url-test
  (testing "with a URL from the environment that is not of the form <base>/ingest/<token>, the relay asks nothing, and
            the status says so"
    (mt/with-temp-env-var-value! [mb-metabase-monitor-url "http://monitor:8080/the-secret-token"]
      (let [{:keys [response posts]} (fetch-status! (fn [& _] (throw (ex-info "never asked" {}))))]
        (is (= [] posts))
        (is (=? {:url  {:status "malformed", :base nil}
                 :feed {:at nil, :error nil, :status nil}}
                response))
        (is (not (str/includes? (json/encode response) "the-secret-token")))))))
