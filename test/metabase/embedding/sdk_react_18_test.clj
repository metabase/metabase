(ns metabase.embedding.sdk-react-18-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.embedding.db :as embedding.db]
   [metabase.embedding.sdk-react-18 :as embedding.sdk-react-18]
   [metabase.test :as mt]
   [metabase.util :as u]
   [ring.mock.request :as ring.mock]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- reset-hosts-this-hour! []
  (reset! @#'embedding.sdk-react-18/hosts-this-hour {:hour nil, :hosts #{}}))

(defn- hosts-this-hour []
  (:hosts @@#'embedding.sdk-react-18/hosts-this-hour))

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

(deftest record-react-18-sdk-host-test
  (mt/with-dynamic-fn-redefs [embedding.db/delete-sdk-react-18-hosts-last-seen-before! (constantly nil)
                              embedding.db/save-sdk-react-18-host!                     (constantly nil)]
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
        (reset-hosts-this-hour!)
        (is (= {:status status} (run-middleware (react-18-sdk-request request-opts) status)))
        (is (= (if recorded? #{"app.example.com"} #{})
               (hosts-this-hour)))))
    (testing "lowercases the hostname"
      (reset-hosts-this-hour!)
      (run-middleware (react-18-sdk-request {:referrer "https://App.Example.COM/page"}) 200)
      (is (= #{"app.example.com"} (hosts-this-hour))))
    (testing "records a host app without a hostname as an empty string"
      (doseq [referrer [nil "file:///app/index.html"]]
        (reset-hosts-this-hour!)
        (run-middleware (react-18-sdk-request {:referrer referrer}) 200)
        (is (= #{""} (hosts-this-hour)) (str referrer))))
    (testing "skips localhost"
      (doseq [referrer ["http://localhost:3000" "http://LOCALHOST:3000" "http://127.0.0.1:3000" "http://[::1]:3000"]]
        (reset-hosts-this-hour!)
        (run-middleware (react-18-sdk-request {:referrer referrer}) 200)
        (is (= #{} (hosts-this-hour)) referrer)))))

(deftest record-react-18-sdk-host-saves-in-background-test
  (let [calls   (atom [])
        db-free (promise)]
    (mt/with-dynamic-fn-redefs [embedding.db/delete-sdk-react-18-hosts-last-seen-before! (fn [cutoff]
                                                                                           (deref db-free 5000 nil)
                                                                                           (swap! calls conj [:delete cutoff]))
                                embedding.db/save-sdk-react-18-host!                     (fn [host _] (swap! calls conj [:save host]))]
      (reset-hosts-this-hour!)
      (testing "responds before the DB writes finish"
        (is (= {:status 200} (run-middleware (react-18-sdk-request {}) 200)))
        (is (= [] @calls)))
      (deliver db-free true)
      (testing "deletes the expired hosts, then saves the host"
        (is (=? [[:delete some?] [:save "app.example.com"]]
                (u/poll {:thunk #(deref calls), :done? #(= 2 (count %)), :timeout-ms 5000})))))))

(deftest record-react-18-sdk-host-failure-test
  (mt/with-dynamic-fn-redefs [embedding.db/delete-sdk-react-18-hosts-last-seen-before! (fn [_] (throw (ex-info "boom" {})))]
    (mt/with-log-messages-for-level [messages [metabase.embedding.sdk-react-18 :warn]]
      (reset-hosts-this-hour!)
      (testing "a failed save does not change the response"
        (is (= {:status 200} (run-middleware (react-18-sdk-request {}) 200))))
      (testing "a failed save logs a warning"
        (is (=? [{:level :warn, :message #"Failed to save a host.*"}]
                (u/poll {:thunk messages, :done? seq, :timeout-ms 5000})))))))

(deftest first-this-hour-test
  (let [first-this-hour? #'embedding.sdk-react-18/first-this-hour?
        hour             (t/instant "2026-10-13T10:00:00Z")]
    (reset-hosts-this-hour!)
    (testing "true only the first time a host is seen in an hour"
      (is (true? (first-this-hour? "app.example.com" hour)))
      (is (false? (first-this-hour? "app.example.com" hour)))
      (is (true? (first-this-hour? "" hour)))
      (is (false? (first-this-hour? "" hour))))
    (testing "a new hour starts over"
      (is (true? (first-this-hour? "app.example.com" (t/plus hour (t/hours 1))))))
    (testing "stops at the cap"
      (reset-hosts-this-hour!)
      (dotimes [i @#'embedding.sdk-react-18/max-hosts-per-hour]
        (first-this-hour? (str "host-" i ".example.com") hour))
      (is (false? (first-this-hour? "one-more.example.com" hour))))
    (testing "concurrent requests let a host through once"
      (reset-hosts-this-hour!)
      (is (= 1 (count (filter true? (pmap (fn [_] (first-this-hour? "app.example.com" hour)) (range 20)))))))))

(defn- stored-host [host]
  (some-> (t2/select-one :model/EmbeddingSdkReact18Host :host host)
          (select-keys [:id :created_at :last_seen_at])
          (update :created_at t/instant)
          (update :last_seen_at t/instant)))

(defn- save-host! [host seen-at]
  (#'embedding.sdk-react-18/save-host! host (t/offset-date-time seen-at)))

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
    (mt/with-model-cleanup [:model/EmbeddingSdkReact18Host]
      (reset-hosts-this-hour!)
      (let [headers (fn [host]
                      {"x-metabase-client"               "embedding-sdk-react"
                       "x-metabase-client-react-version" "18.3.1"
                       "x-metabase-embed-referrer"       (str "https://" host "/page")})]
        (testing "anonymous requests are not recorded, even when they succeed"
          (mt/client :get 200 "session/properties" {:request-options {:headers (headers "anonymous.example.com")}})
          (is (= #{} (hosts-this-hour))))
        (testing "logged-in requests are recorded and saved"
          (mt/user-http-request :rasta :get 200 "user/current"
                                {:request-options {:headers (headers "handler.example.com")}})
          (is (= #{"handler.example.com"} (hosts-this-hour)))
          (is (u/poll {:thunk      #(t2/exists? :model/EmbeddingSdkReact18Host :host "handler.example.com")
                       :done?      true?
                       :timeout-ms 10000})))))))
