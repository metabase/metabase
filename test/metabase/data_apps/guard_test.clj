(ns metabase.data-apps.guard-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api-routes.routes]
   [metabase.api-scope.data-app :as api-scope]
   [metabase.api.macros :as api.macros]
   [metabase.data-apps.guard :as guard]
   [metabase.data-apps.guards.card :as guards.card]
   [metabase.data-apps.guards.dataset :as guards.dataset]
   [metabase.data-apps.guards.field :as guards.field]
   [metabase.data-apps.guards.sandbox-table :as guards.sandbox-table]
   [metabase.data-apps.guards.table :as guards.table]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private guarded
  "API namespace => the path under `/api` of its guarded mount, and the checks of that mount's guard."
  {'metabase.query-processor.api             {:path "dataset" :checks guards.dataset/checks}
   'metabase.queries-rest.api.card           {:path "card" :checks guards.card/checks}
   'metabase.warehouse-schema-rest.api.table {:path "table" :checks guards.table/checks}
   'metabase-enterprise.sandbox.api.table    {:path "table" :checks guards.sandbox-table/checks}
   'metabase.warehouse-schema-rest.api.field {:path "field" :checks guards.field/checks}})

(def ^:private unguarded-namespaces
  "The namespaces with endpoints a data app reaches that no guard covers."
  #{'metabase-enterprise.content-translation.routes
    'metabase-enterprise.custom-viz-plugin.api
    'metabase-enterprise.data-apps.api
    'metabase.actions-rest.api
    'metabase.collections-rest.api
    'metabase.dashboards-rest.api
    'metabase.native-query-snippets.api
    'metabase.search.api
    'metabase.session.api
    'metabase.timeline.api.timeline
    'metabase.user-key-value.api
    'metabase.users-rest.api
    'metabase.warehouses-rest.api})

(defn- data-app-endpoints
  "API namespace => the `[method route]` pairs of its endpoints tagged with the data-app scope, with their route param
  regexes, among loaded namespaces."
  []
  (into {}
        (keep (fn [a-namespace]
                (when-let [endpoints (not-empty (into {}
                                                      (for [[[method route regexes] info] (api.macros/ns-routes a-namespace)
                                                            :when (= api-scope/data-app (get-in info [:form :metadata :scope]))]
                                                        [[method route] regexes])))]
                  [(ns-name a-namespace) endpoints])))
        (all-ns)))

(deftest every-data-app-endpoint-is-guarded-test
  (testing "a namespace with data-app endpoints has a guard over exactly those endpoints, or is listed as unguarded"
    (doseq [[nmspace endpoints] (data-app-endpoints)]
      (testing nmspace
        (if-let [{:keys [checks]} (get guarded nmspace)]
          (is (= (set (keys endpoints)) (set (keys checks))))
          (is (contains? unguarded-namespaces nmspace)))))))

(defn- sample-path
  "A path to `route` with each route param replaced by a value that its regex in `regexes` accepts."
  [route regexes]
  (reduce (fn [path param]
            (let [pattern (re-pattern (get regexes param "[^/]+"))]
              (str/replace-first path (str ":" param)
                                 (some #(when (re-matches pattern %) %) ["1" "csv" "AbCdEfGhIjKlMnOpQrStU" "x"]))))
          route
          (map second (re-seq #":([A-Za-z0-9_\-]+)" route))))

(deftest every-guard-is-mounted-test
  (testing "a data-app request to each endpoint of a guarded namespace reaches a guard through the API's routes"
    (doseq [features [#{} #{:sandboxes}]
            :let     [endpoints (data-app-endpoints)]
            [nmspace {:keys [path]}] guarded
            [[method route] regexes] (get endpoints nmspace)]
      (let [checked (atom [])]
        (mt/with-premium-features features
          (mt/with-dynamic-fn-redefs [guard/check-request! (fn [guard-nmspace _ns-checks request]
                                                             (when-let [{guarded-route :route} (api.macros/matching-route guard-nmspace request)]
                                                               (swap! checked conj guarded-route)
                                                               (throw (ex-info "Checked" {:status-code 403}))))]
            (mt/user-http-request :crowberto method (str path (sample-path route regexes))
                                  {:request-options {:headers {"x-metabase-client" "data-app"}}})))
        (testing (format "%s %s %s with %s" nmspace method route features)
          (is (= [[method route]] @checked)))))))

(defn- run-guard
  "What the guard over `metabase.query-processor.api` with `ns-checks` does with `request`: `:handled` when it hands the
  request to the handler, or the exception it raises."
  [ns-checks request]
  (let [result (promise)]
    ((#'guard/guard 'metabase.query-processor.api
                    ns-checks
                    (fn [_request respond _raise] (respond :handled)))
     request
     #(deliver result %)
     #(deliver result %))
    (deref result 1000 ::timed-out)))

(defn- request
  "A `method` request to `path` of `metabase.query-processor.api`, from a data app when `data-app?`."
  [method path data-app?]
  (cond-> {:request-method method :uri path :path-info path}
    data-app? (assoc :data-app-scoped? true)))

(deftest guard-test
  (let [checked  (atom [])
        ns-checks {[:post "/"]               (fn [_request _route-params] (swap! checked conj :checked) nil)
                   [:post "/:export-format"] (fn [_request route-params]
                                               (throw (ex-info "Refused" {:status-code 403 :route-params route-params})))}]
    (testing "a request that is not from a data app passes unchecked"
      (is (= :handled (run-guard ns-checks (request :post "/native" false))))
      (is (= [] @checked)))
    (testing "a data-app request passes when its endpoint's check does"
      (is (= :handled (run-guard ns-checks (request :post "/" true))))
      (is (= [:checked] @checked)))
    (testing "a data-app request is refused with the error its endpoint's check throws, which gets the route params"
      (is (=? {:route-params {:export-format "csv"}} (ex-data (run-guard ns-checks (request :post "/csv" true))))))
    (testing "a data-app request to an endpoint missing from the table is refused"
      (let [e (run-guard ns-checks (request :post "/native" true))]
        (is (= 403 (:status-code (ex-data e))))))
    (testing "a data-app request that reaches no endpoint of the namespace passes on"
      (is (= :handled (run-guard ns-checks (request :get "/no-such-endpoint" true)))))))

(deftest data-app-confined-token-is-guarded-test
  (let [checked   (atom [])
        ns-checks {[:post "/"] (fn [_request route-params] (swap! checked conj route-params) nil)}
        confined  (fn [method path scopes] (assoc (request method path false) :token-scopes scopes))]
    (testing "a request confined to the data-app scope is refused at an endpoint missing from the table"
      (doseq [scopes [#{"data-apps:base"} #{"data-apps:*"}]]
        (testing scopes
          (let [e (run-guard ns-checks (confined :post "/native" scopes))]
            (is (= 403 (:status-code (ex-data e))))))))
    (testing "a request confined to the data-app scope runs its endpoint's check"
      (is (= :handled (run-guard ns-checks (confined :post "/" #{"data-apps:base"}))))
      (is (= [{}] @checked)))
    (testing "a full-access request passes unchecked"
      (reset! checked [])
      (doseq [scopes [#{:metabase.api.macros.scope/unrestricted} #{"*"} nil]]
        (testing scopes
          (is (= :handled (run-guard ns-checks (confined :post "/native" scopes))))
          (is (= :handled (run-guard ns-checks (confined :post "/" scopes))))))
      (is (= [] @checked)))))

(deftest check-returning-a-value-refuses-test
  (testing "a data-app request is refused when its endpoint's check returns false instead of throwing"
    (let [result (run-guard {[:post "/"] (fn [_request _route-params] false)}
                            (request :post "/" true))]
      (is (instance? Throwable result))
      (is (not= :handled result)))))

(deftest check-filter-test
  (testing "the function a check returns filters the body of a 2xx response, and only of one"
    (doseq [[status filtered?] [[200 true] [202 true] [400 false]]]
      (let [result (promise)]
        ((#'guard/guard 'metabase.query-processor.api
                        {[:post "/"] (fn [_request _route-params] #(assoc % :filtered true))}
                        (fn [_request respond _raise] (respond {:status status :body {}})))
         (request :post "/" true)
         #(deliver result %)
         #(deliver result %))
        (is (= filtered? (boolean (get-in (deref result 1000 ::timed-out) [:body :filtered]))))))))
