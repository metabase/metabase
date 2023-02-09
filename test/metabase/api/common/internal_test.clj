(ns metabase.api.common.internal-test
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [compojure.core :refer [POST]]
   [malli.util :as mut]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.common.internal :as internal]
   [metabase.config :as config]
   [metabase.logger :as mb.logger]
   [metabase.server.middleware.exceptions :as mw.exceptions]
   [metabase.test :as mt]
   [metabase.util :as u]
   [ring.adapter.jetty9 :as jetty]))

(def TestAddress
  [:map
   {:title "Address"}
   [:id string?]
   ;; TODO: coerce stuff automatically via:
   ;; (mc/decode
   ;;  [:map [:tags [:set keyword?]]]
   ;;  (json/decode "{\"tags\": [\"a\", \"b\"]}" true)
   ;;  (mtx/json-transformer))
   ;; ;; => {:tags #{:b :a}}
   [:tags [:vector string?]]
   [:address
    [:map
     [:street string?]
     [:city string?]
     [:zip int?]
     [:lonlat [:tuple double? double?]]]]])

(def ClosedTestAddress
  (mut/closed-schema TestAddress))

(api/defendpoint POST "/post/any" [:as {body :body :as _request}]
  {:status 200 :body body})

(api/defendpoint POST "/post/id-int"
  [:as {{:keys [id] :as body} :body :as _request}]
  {id int?}
  {:status 200 :body body})

(api/defendpoint POST "/post/test-address"
  [:as {address :body :as _request}]
  {address TestAddress}
  {:status 200 :body address})

(api/defendpoint POST "/post/closed-test-address"
  [:as {address :body :as _request}]
  {address ClosedTestAddress}
  {:status 200 :body address})

(api/define-routes)

(defn- json-mw [handler]
  (fn [req]
    (update
     (handler
      (update req :body #(-> % slurp (json/parse-string true))))
     :body json/generate-string)))

(defn exception-mw [handler]
  (fn [req] (try
              (handler req)
              (catch Exception e (mw.exceptions/api-exception-response e)))))

(deftest defendpoint-test
  (let [server (jetty/run-jetty (json-mw (exception-mw #'routes)) {:port 0 :join? false})
        port   (.. server getURI getPort)
        post!  (fn [route body]
                 (http/post (str "http://localhost:" port route)
                            {:throw-exceptions false
                             :accept           :json
                             :as               :json
                             :coerce           :always
                             :body             (json/generate-string body)}))]
    (is (= {:a 1 :b 2} (:body (post! "/post/any" {:a 1 :b 2}))))

    (is (= {:id 1} (:body (post! "/post/id-int" {:id 1}))))
    (is (= {:errors          {:id "integer"},
            :specific-errors {:id ["should be an int"]}}
           (:body (post! "/post/id-int" {:id "1"}))))

    (mt/with-log-level [metabase.api.common :warn]
      (is (= {:id      "myid"
              :tags    ["abc"]
              :address {:street "abc" :city "sdasd" :zip 2999 :lonlat [0.0 0.0]}}
             (:body (post! "/post/test-address"
                           {:id      "myid"
                            :tags    ["abc"]
                            :address {:street "abc"
                                      :city   "sdasd"
                                      :zip    2999
                                      :lonlat [0.0 0.0]}}))))
      (is (some (fn [{message :msg, :as entry}]
                  (when (str/includes? (str message)
                                       (str "Unexpected parameters at [:post \"/post/test-address\"]: [:tags :address :id]\n"
                                            "Please add them to the schema or remove them from the API client"))
                    entry))
                (mb.logger/messages))))

    (is (= {:errors
            {:address "map (titled: ‘Address’) where {:id -> <string>, :tags -> <vector of string>, :address -> <map where {:street -> <string>, :city -> <string>, :zip -> <integer>, :lonlat -> <vector with exactly 2 items of type: double, double>}>}"},
            :specific-errors {:address {:id      ["missing required key"],
                                        :tags    ["missing required key"],
                                        :address ["missing required key"]}}}
           (:body (post! "/post/test-address" {:x "1"}))))

    (is (= {:errors
            {:address "map (titled: ‘Address’) where {:id -> <string>, :tags -> <vector of string>, :address -> <map where {:street -> <string>, :city -> <string>, :zip -> <integer>, :lonlat -> <vector with exactly 2 items of type: double, double>}>}"},
            :specific-errors {:address
                              {:id      ["should be a string"]
                               :tags    ["invalid type"]
                               :address {:street ["missing required key"]
                                         :zip    ["should be an int"]}}}}
           (:body (post! "/post/test-address" {:id      1288
                                               :tags    "a,b,c"
                                               :address {:streeqt "abc"
                                                         :city    "sdasd"
                                                         :zip     "12342"
                                                         :lonlat  [0.0 0.0]}}))))

    (is (= {:errors
            {:address "map (titled: ‘Address’) where {:id -> <string>, :tags -> <vector of string>, :address -> <map where {:street -> <string>, :city -> <string>, :zip -> <integer>, :lonlat -> <vector with exactly 2 items of type: double, double>} with no other keys>} with no other keys"},
            :specific-errors {:address
                              {:address ["missing required key"],
                               :a       ["disallowed key"],
                               :b       ["disallowed key"]}}}
           (:body (post! "/post/closed-test-address" {:id "1" :tags [] :a 1 :b 2}))))))

(deftest route-fn-name-test
  (are [method route expected] (= expected
                                  (internal/route-fn-name method route))
    'GET "/"                    'GET_
    'GET "/:id/cards"           'GET_:id_cards
    ;; check that internal/route-fn-name can handle routes with regex conditions
    'GET ["/:id" :id #"[0-9]+"] 'GET_:id))

(deftest arg-type-test
  (are [param expected] (= expected
                           (internal/arg-type param))
    :fish    nil
    :id      :int
    :card-id :int))

(defmacro ^:private no-route-regexes
  "`clojure.data/diff` doesn't think two regexes with the same exact pattern are equal. so in order to make sure we're
  getting back the right output we'll just change them to strings, e.g.

    #\"[0-9]+\" -> \"#[0-9]+\""
  {:style/indent 0}
  [& body]
  `(binding [internal/*auto-parse-types* (m/map-vals #(update % :route-param-regex (partial str "#"))
                                                     internal/*auto-parse-types*)]
     ~@body))

(deftest route-param-regex-test
  (no-route-regexes
   (are [param expected] (= expected
                            (internal/route-param-regex param))
     :fish    nil
     :id      [:id "#[0-9]+"]
     :card-id [:card-id "#[0-9]+"])))

(deftest route-arg-keywords-test
  (no-route-regexes
   (are [route expected] (= expected
                            (internal/route-arg-keywords route))
     "/"             []
     "/:id"          [:id]
     "/:id/card"     [:id]
     "/:id/etc/:org" [:id :org]
     "/:card-id"     [:card-id])))

(deftest type-args-test
  (no-route-regexes
   (are [args expected] (= expected
                           (#'internal/typify-args args))
     []             []
     [:fish]        []
     [:fish :fry]   []
     [:id]          [:id "#[0-9]+"]
     [:id :fish]    [:id "#[0-9]+"]
     [:id :card-id] [:id "#[0-9]+" :card-id "#[0-9]+"])))

(deftest add-route-param-regexes-test
  (no-route-regexes
   (are [route expected] (= expected
                            (internal/add-route-param-regexes route))
     "/"                                    "/"
     "/:id"                                 ["/:id" :id "#[0-9]+"]
     "/:id/card"                            ["/:id/card" :id "#[0-9]+"]
     "/:card-id"                            ["/:card-id" :card-id "#[0-9]+"]
     "/:fish"                               "/:fish"
     "/:id/tables/:card-id"                 ["/:id/tables/:card-id" :id "#[0-9]+" :card-id "#[0-9]+"]
     ;; don't try to typify route that's already typified
     ["/:id/:crazy-id" :crazy-id "#[0-9]+"] ["/:id/:crazy-id" :crazy-id "#[0-9]+"]
     ;; Check :uuid args
     "/:uuid/toucans"                       ["/:uuid/toucans" :uuid (str \# u/uuid-regex)])))

(deftest let-form-for-arg-test
  (are [arg expected] (= expected
                         (internal/let-form-for-arg arg))
    'id           '[id (clojure.core/when id (metabase.api.common.internal/parse-int id))]
    'org_id       '[org_id (clojure.core/when org_id (metabase.api.common.internal/parse-int org_id))]
    'fish         nil
    ;; make sure we don't try to generate let forms for any fancy destructuring
    :as           nil
    '{body :body} nil))

(deftest auto-parse-test
  (are [args expected] (= expected
                          (macroexpand-1 `(internal/auto-parse ~args '~'body)))
    ;; when auto-parse gets an args form where arg is present in *autoparse-types*
    ;; the appropriate let binding should be generated
    '[id]
    '(clojure.core/let [id (clojure.core/when id (metabase.api.common.internal/parse-int id))] 'body)

    ;; params not in *autoparse-types* should be ignored
    '[id some-other-param]
    '(clojure.core/let [id (clojure.core/when id (metabase.api.common.internal/parse-int id))] 'body)

    ;; make sure multiple autoparse params work correctly
    '[id org_id]
    '(clojure.core/let [id (clojure.core/when id (metabase.api.common.internal/parse-int id))
                        org_id (clojure.core/when org_id (metabase.api.common.internal/parse-int org_id))] 'body)

    ;; make sure it still works if no autoparse params are passed
    '[some-other-param]
    '(clojure.core/let [] 'body)

    ;; should work with no params at all
    '[]
    '(clojure.core/let [] 'body)

    ;; should work with some wacky binding form
    '[id :as {body :body}]
    '(clojure.core/let [id (clojure.core/when id (metabase.api.common.internal/parse-int id))] 'body)))

(deftest enterprise-endpoint-name-test
  (when config/ee-available?
    (testing "Make sure the route name for enterprise API endpoints is somewhat correct"
      (require 'metabase-enterprise.advanced-permissions.api.application)
      (is (= "GET /api/ee/advanced-permissions/application/graph"
             (#'internal/endpoint-name (the-ns 'metabase-enterprise.advanced-permissions.api.application)
                                       'GET
                                       "/graph"))))))
