(ns metabase.api.util.handlers-test
  "Tests for route-template reconstruction: as a request descends the routing tree, each level records the route
  pattern it consumed on the request's `:route-prefix`, and the endpoint that finally matches gets stamped with a
  `:route-template` — the full template, e.g. `\"/api/card/:id\"`.

  The endpoints below exist only to echo that `:route-template` back so tests can assert on it."
  (:require
   [clojure.test :refer :all]
   [metabase.api.macros :as api.macros]
   [metabase.api.util.handlers :as handlers]
   [metabase.initialization-status.core :as init-status]
   [metabase.server.routes :as server.routes]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

;;;; ------------------------------------------------- endpoints --------------------------------------------------

(defn- echo-route-template [request]
  {:status 200
   :body   {:route-template (:route-template request)}})

(api.macros/defendpoint :get "/"
  "Root route."
  [_route-params _query-params _body request]
  (echo-route-template request))

(api.macros/defendpoint :get "/:id"
  "Single route param."
  [_route-params _query-params _body request]
  (echo-route-template request))

(api.macros/defendpoint :get ["/uuid/:uuid" :uuid u/uuid-regex]
  "Route param constrained by an explicit regex. The template must name the param, not the regex."
  [_route-params _query-params _body request]
  (echo-route-template request))

(api.macros/defendpoint :get ["/:id/query/:export-format" :id #"[0-9]+" :export-format #"csv|json"]
  "Several segments, two of them params."
  [_route-params _query-params _body request]
  (echo-route-template request))

(def ^:private endpoints-handler
  (delay (api.macros/ns-handler 'metabase.api.util.handlers-test)))

;;;; ------------------------------------------------ test helpers ------------------------------------------------

(defn- handle
  "Invoke the async Ring `handler` and return its response synchronously."
  [handler request]
  (let [result (promise)]
    (handler request #(deliver result %) #(deliver result %))
    (let [response (deref result 10000 ::timeout)]
      (when (instance? Throwable response)
        (throw response))
      response)))

(defn- route-template
  "`GET` `uri` through `handler` and return the `:route-template` the routing machinery stamped on the request, or
  `::no-match` if nothing matched."
  ([handler uri]
   (route-template handler uri nil))
  ([handler uri extra-request-keys]
   (->> (merge {:request-method :get, :uri uri, :headers {}} extra-request-keys)
        (handle handler)
        :body
        :route-template)))

(defn- api-route-template
  "Like [[route-template]], but goes through the real top-level Metabase handler with `route-map` mounted where the
  `/api` routes normally live — i.e. behind the `(context \"/api\" [] ...)`
  in [[metabase.server.routes/make-routes]]. This is what proves the `/api` segment, which Compojure's `context`
  consumes before our own routing code ever sees it, still makes it into the template."
  ([route-map uri]
   (api-route-template route-map uri nil))
  ([route-map uri extra-request-keys]
   (dynamic-redefs/with-dynamic-fn-redefs [init-status/complete? (constantly true)]
     (route-template (server.routes/make-routes (handlers/route-map-handler route-map))
                     uri
                     extra-request-keys))))

(def ^:private api-route-map
  (delay {"/handlers-test" @endpoints-handler}))

;;;; --------------------------------------------------- tests ----------------------------------------------------

(deftest ^:parallel route-template-includes-compojure-context-test
  (testing "the `/api` prefix consumed by Compojure's `context` is part of the template"
    (is (= "/api/handlers-test/:id"
           (api-route-template @api-route-map "/api/handlers-test/123")))))

(deftest ^:parallel route-template-root-route-test
  (testing "a `\"/\"` endpoint is the prefix itself, with no trailing slash"
    (are [uri] (= "/api/handlers-test"
                  (api-route-template @api-route-map uri))
      "/api/handlers-test"
      "/api/handlers-test/")))

(deftest ^:parallel route-template-regex-constrained-param-test
  (testing "an explicitly regex-constrained param appears as its placeholder name, never as the regex"
    (is (= "/api/handlers-test/uuid/:uuid"
           (api-route-template @api-route-map "/api/handlers-test/uuid/f7e9a4b8-0000-4000-8000-abcdefabcdef")))))

(deftest ^:parallel route-template-unmatched-route-test
  (testing "nothing is stamped when no endpoint matches"
    ;; deliberately not routed through [[api-route-template]]: an unmatched `/api/...` request falls all the way
    ;; through to the SPA catch-all, which needs a running app.
    (is (nil? (handle (handlers/route-map-handler @api-route-map)
                      {:request-method :get
                       :uri            "/handlers-test/uuid/not-a-uuid"
                       :headers        {}})))))

(deftest ^:parallel route-template-multiple-params-test
  (is (= "/api/handlers-test/:id/query/:export-format"
         (api-route-template @api-route-map "/api/handlers-test/123/query/csv"))))

(deftest ^:parallel route-template-nested-route-maps-test
  (testing "every route-map level contributes the prefix it consumed"
    (is (= "/api/handlers-test/nested/deeper/:id"
           (api-route-template {"/handlers-test" {"/nested" {"/deeper" @endpoints-handler}}}
                               "/api/handlers-test/nested/deeper/123")))))

(deftest ^:parallel route-template-excludes-query-string-test
  (testing "the template is built from route structure only — nothing from the query string leaks in"
    (are [extra] (= "/api/handlers-test/:id"
                    (api-route-template @api-route-map "/api/handlers-test/123" extra))
      {:query-string "secret=hunter2&card_id=456"}
      {:query-params {"secret" "hunter2", "card_id" "456"}}
      {:query-string "secret=hunter2", :query-params {"secret" "hunter2"}})))

(deftest ^:parallel route-template-outside-api-context-test
  (testing "route maps not mounted under a Compojure context (e.g. the `/auth` routes) accumulate from the root"
    (let [handler (handlers/route-map-handler {"/auth" {"/handlers-test" @endpoints-handler}})]
      (is (= "/auth/handlers-test/:id"
             (route-template handler "/auth/handlers-test/123")))
      (is (= "/auth/handlers-test"
             (route-template handler "/auth/handlers-test"))))))

(deftest ^:parallel route-template-without-any-prefix-test
  (testing "an endpoint handler used on its own still gets its ns-relative template"
    (is (= "/:id"
           (route-template @endpoints-handler "/123")))
    (is (= "/"
           (route-template @endpoints-handler "/")))))

(deftest ^:parallel route-prefix-is-accumulated-not-overwritten-test
  (testing "each level appends to `:route-prefix` rather than replacing it"
    (let [prefixes (atom [])
          spy      (fn [request respond _raise]
                     (swap! prefixes conj (:route-prefix request))
                     (respond {:status 200, :body {}}))
          handler  (handlers/route-map-handler {"/a" {"/b" {"/c" spy}}})]
      (handle handler {:request-method :get, :uri "/a/b/c/d", :headers {}})
      (is (= ["/a/b/c"] @prefixes)))))
