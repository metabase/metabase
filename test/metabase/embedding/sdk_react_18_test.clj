(ns metabase.embedding.sdk-react-18-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.embedding.db :as embedding.db]
   [metabase.embedding.sdk-react-18 :as embedding.sdk-react-18]
   [metabase.test :as mt]
   [ring.mock.request :as ring.mock]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- react-18-sdk-request
  [{:keys [method uri user-id client react-version referrer preview?]
    :or   {method        :get
           uri           "/api/user/current"
           user-id       1
           client        "embedding-sdk-react"
           react-version "18.3.1"
           referrer      "https://app.example.com/page"}}]
  (cond-> (ring.mock/request method uri)
    client        (ring.mock/header "x-metabase-client" client)
    react-version (ring.mock/header "x-metabase-client-react-version" react-version)
    referrer      (ring.mock/header "x-metabase-embed-referrer" referrer)
    preview?      (ring.mock/header "x-metabase-embedded-preview" "true")
    user-id       (assoc :metabase-user-id user-id)))

(defn- run-middleware [request status]
  (let [handler (embedding.sdk-react-18/wrap-record-react-18-sdk-host
                 (fn [_ respond _] (respond {:status status})))]
    (handler request identity identity)))

(defn- saved-hosts!
  "Empties the table, calls `thunk` and returns the hosts it saved."
  [thunk]
  (t2/delete! :model/EmbeddingSdkReact18Host)
  (thunk)
  (vec (t2/select-fn-vec :host :model/EmbeddingSdkReact18Host)))

;; With `synchronous-batch-updates` the save runs right away, on the calling thread, instead of in a batch.
(deftest record-react-18-sdk-host-test
  (mt/with-temporary-setting-values [synchronous-batch-updates true]
    (mt/with-model-cleanup [:model/EmbeddingSdkReact18Host]
      (doseq [[description request-opts status recorded?]
              [["logged-in user"           {}                                                         200 true]
               ["valid guest token"        {:user-id nil, :uri "/api/embed/card/token"}               200 true]
               ["streaming response"       {}                                                         202 true]
               ["React 19"                 {:react-version "19.1.0"}                                  200 false]
               ["no React version"         {:react-version nil}                                       200 false]
               ["EAJS"                     {:client "embedding-simple"}                               200 false]
               ["embed preview"            {:preview? true}                                           200 false]
               ["POST"                     {:method :post}                                            200 false]
               ["OPTIONS on a guest route" {:method :options, :user-id nil, :uri "/api/embed/card/x"} 200 false]
               ["error"                    {}                                                         500 false]
               ["anonymous"                {:user-id nil}                                             200 false]
               ["invalid guest token"      {:user-id nil, :uri "/api/embed/card/token"}               400 false]]]
        (testing description
          (is (= (if recorded? ["app.example.com"] [])
                 (saved-hosts! #(is (= {:status status} (run-middleware (react-18-sdk-request request-opts) status))))))))
      (testing "lowercases the hostname"
        (is (= ["app.example.com"]
               (saved-hosts! #(run-middleware (react-18-sdk-request {:referrer "https://App.Example.COM/page"}) 200)))))
      (testing "records a host app without a hostname as an empty string"
        (doseq [referrer [nil "file:///app/index.html"]]
          (is (= [""] (saved-hosts! #(run-middleware (react-18-sdk-request {:referrer referrer}) 200)))
              (str referrer))))
      (testing "skips localhost"
        (doseq [referrer ["http://localhost:3000" "http://LOCALHOST:3000" "http://127.0.0.1:3000" "http://[::1]:3000"]]
          (is (= [] (saved-hosts! #(run-middleware (react-18-sdk-request {:referrer referrer}) 200)))
              referrer))))))

(deftest save-hosts-test
  (let [saved   (atom [])
        earlier (t/offset-date-time "2026-10-13T10:00:00Z")
        later   (t/offset-date-time "2026-10-13T10:00:30Z")]
    (mt/with-dynamic-fn-redefs [embedding.db/delete-sdk-react-18-hosts-last-seen-before! (constantly nil)
                                embedding.db/save-sdk-react-18-host!                     #(swap! saved conj [%1 %2])]
      (testing "saves each host once, with the newest time it was seen"
        (#'embedding.sdk-react-18/save-hosts! [{:host "a.example.com", :timestamp later}
                                               {:host "a.example.com", :timestamp earlier}
                                               {:host "b.example.com", :timestamp earlier}])
        (is (= [["a.example.com" later] ["b.example.com" earlier]] (sort-by first @saved)))))))

(deftest save-hosts-failure-test
  (let [now   (t/offset-date-time)
        saved (atom [])]
    (testing "a failed delete logs a warning, and the hosts are still saved"
      (mt/with-dynamic-fn-redefs [embedding.db/delete-sdk-react-18-hosts-last-seen-before! (fn [_] (throw (ex-info "boom" {})))
                                  embedding.db/save-sdk-react-18-host!                     (fn [host _] (swap! saved conj host))]
        (mt/with-log-messages-for-level [messages [metabase.embedding.sdk-react-18 :warn]]
          (#'embedding.sdk-react-18/save-hosts! [{:host "app.example.com", :timestamp now}])
          (is (= ["app.example.com"] @saved))
          (is (=? [{:level :warn, :message #"Failed to delete the expired hosts.*"}]
                  (messages))))))
    (testing "a host that fails to save does not stop the other hosts"
      (reset! saved [])
      (mt/with-dynamic-fn-redefs [embedding.db/delete-sdk-react-18-hosts-last-seen-before! (constantly nil)
                                  embedding.db/save-sdk-react-18-host!                     (fn [host _]
                                                                                             (when (= host "bad.example.com")
                                                                                               (throw (ex-info "boom" {})))
                                                                                             (swap! saved conj host))]
        (mt/with-log-messages-for-level [messages [metabase.embedding.sdk-react-18 :warn]]
          (#'embedding.sdk-react-18/save-hosts! [{:host "bad.example.com", :timestamp now}
                                                 {:host "good.example.com", :timestamp now}])
          (is (= ["good.example.com"] @saved))
          (is (=? [{:level :warn, :message #"Failed to save a host.*"}]
                  (messages))))))))

(defn- stored-host [host]
  (some-> (t2/select-one :model/EmbeddingSdkReact18Host :host host)
          (select-keys [:id :created_at :last_seen_at])
          (update :created_at t/instant)
          (update :last_seen_at t/instant)))

(defn- save-host! [host seen-at]
  (#'embedding.sdk-react-18/save-hosts! [{:host host, :timestamp (t/offset-date-time seen-at)}]))

(deftest save-host-test
  (mt/with-model-cleanup [:model/EmbeddingSdkReact18Host]
    (t2/delete! :model/EmbeddingSdkReact18Host)
    (mt/with-clock #t "2026-10-13T10:00:00Z[UTC]"
      (testing "inserts a new host, also the empty host of apps without a hostname"
        (save-host! "app.example.com" "2026-10-13T10:00:00Z")
        (save-host! "" "2026-10-13T10:00:00Z")
        (is (=? {:created_at some?, :last_seen_at (t/instant "2026-10-13T10:00:00Z")}
                (stored-host "app.example.com")))
        (is (=? {:last_seen_at (t/instant "2026-10-13T10:00:00Z")}
                (stored-host ""))))
      (let [inserted (stored-host "app.example.com")]
        (testing "moves last_seen_at forward and keeps the row and its created_at"
          (save-host! "app.example.com" "2026-10-13T11:00:00Z")
          (is (= (assoc inserted :last_seen_at (t/instant "2026-10-13T11:00:00Z"))
                 (stored-host "app.example.com"))))
        (testing "never moves last_seen_at back, e.g. after a slow write from another server"
          (save-host! "app.example.com" "2026-10-13T10:30:00Z")
          (is (= (t/instant "2026-10-13T11:00:00Z")
                 (:last_seen_at (stored-host "app.example.com")))))
        (testing "keeps one row per host"
          (is (= 1 (t2/count :model/EmbeddingSdkReact18Host :host "app.example.com"))))
        (mt/with-clock #t "2026-10-18T10:00:00Z[UTC]"
          (t2/update! :model/EmbeddingSdkReact18Host {:host ""} {:last_seen_at (t/offset-date-time "2026-10-15T10:00:00Z")})
          (save-host! "app.example.com" "2026-10-18T10:00:00Z")
          (testing "saves a host last seen more than 4 days ago again, as a new row"
            (is (=? {:id           (partial not= (:id inserted))
                     :last_seen_at (t/instant "2026-10-18T10:00:00Z")}
                    (stored-host "app.example.com"))))
          (testing "keeps the hosts seen in the last 4 days"
            (is (=? {:last_seen_at (t/instant "2026-10-15T10:00:00Z")}
                    (stored-host "")))))))))

(deftest host-validation-test
  (mt/with-model-cleanup [:model/EmbeddingSdkReact18Host]
    (t2/delete! :model/EmbeddingSdkReact18Host)
    (let [now (t/offset-date-time)]
      (testing "the model accepts a lowercase host, and \"\" for a host app without a hostname"
        (t2/insert! :model/EmbeddingSdkReact18Host [{:host "valid.example.com", :last_seen_at now}
                                                    {:host "", :last_seen_at now}])
        (is (= 2 (t2/count :model/EmbeddingSdkReact18Host))))
      (testing "the model rejects any other host"
        (doseq [host ["Upper.example.com" nil]]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid React 18 SDK host"
                                (t2/insert! :model/EmbeddingSdkReact18Host {:host host, :last_seen_at now}))
              (pr-str host)))))))

(deftest record-react-18-sdk-host-handler-test
  (testing "the middleware runs after authentication and saves the host"
    (mt/with-temporary-setting-values [synchronous-batch-updates true]
      (mt/with-model-cleanup [:model/EmbeddingSdkReact18Host]
        (let [headers (fn [host]
                        {"x-metabase-client"               "embedding-sdk-react"
                         "x-metabase-client-react-version" "18.3.1"
                         "x-metabase-embed-referrer"       (str "https://" host "/page")})]
          ;; so a row left by an earlier run can't make the assertions below pass
          (t2/delete! :model/EmbeddingSdkReact18Host :host [:in ["anonymous.example.com" "handler.example.com"]])
          (testing "anonymous requests are not recorded, even when they succeed"
            (mt/client :get 200 "session/properties" {:request-options {:headers (headers "anonymous.example.com")}})
            (is (not (t2/exists? :model/EmbeddingSdkReact18Host :host "anonymous.example.com"))))
          (testing "logged-in requests are recorded and saved"
            (mt/user-http-request :rasta :get 200 "user/current"
                                  {:request-options {:headers (headers "handler.example.com")}})
            (is (t2/exists? :model/EmbeddingSdkReact18Host :host "handler.example.com"))))))))
