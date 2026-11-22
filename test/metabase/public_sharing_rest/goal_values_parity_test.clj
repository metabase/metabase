(ns metabase.public-sharing-rest.goal-values-parity-test
  "Each public chart route and its `/goal-values` route resolve the chart through the same resolver, so the same bad
  input must fail both with the same status."
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.public-sharing-rest.goal-values-parity-test]}}}}}}
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api.macros :as api.macros]
   [metabase.documents.test-util :as documents.test-util]
   [metabase.public-sharing-rest.api]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- public-uuid [] (str (random-uuid)))

(defn- do-with-public-charts
  "Calls `f` with the ids and public uuids of a public Card, a public Dashboard showing it, and a public Document
  embedding a Card, plus objects that don't belong to them."
  [f]
  (let [card-uuid (public-uuid)
        dash-uuid (public-uuid)
        doc-uuid  (public-uuid)
        shared    {:made_public_by_id (mt/user->id :crowberto)}
        query     (mt/mbql-query venues {:aggregation [[:count]]})]
    (mt/with-temp [:model/Card          {card-id :id}           (merge shared {:dataset_query query :public_uuid card-uuid})
                   :model/Card          {stray-card-id :id}     {:dataset_query query}
                   :model/Dashboard     {dash-id :id}           (merge shared {:public_uuid dash-uuid})
                   :model/Dashboard     {other-dash-id :id}     {}
                   :model/DashboardCard {dashcard-id :id}       {:dashboard_id dash-id :card_id card-id}
                   :model/DashboardCard {other-dashcard-id :id} {:dashboard_id other-dash-id :card_id card-id}
                   :model/Document      {doc-id :id}            (merge shared {:name        "Parity document"
                                                                               :document    (documents.test-util/text->prose-mirror-ast "x")
                                                                               :public_uuid doc-uuid})
                   :model/Card          {doc-card-id :id}       {:dataset_query query :document_id doc-id}]
      (t2/update! :model/Document :id doc-id {:document (documents.test-util/cards->prose-mirror-ast [doc-card-id])})
      (f {:card-id           card-id
          :card-uuid         card-uuid
          :stray-card-id     stray-card-id
          :dash-id           dash-id
          :dash-uuid         dash-uuid
          :dashcard-id       dashcard-id
          :other-dashcard-id other-dashcard-id
          :doc-id            doc-id
          :doc-uuid          doc-uuid
          :doc-card-id       doc-card-id}))))

(def ^:private route-families
  "Each public chart route with a `/goal-values` twin. `:params` gives the route params of a valid request; each case
  can break them (`:params`), the app DB (`:setup`), or the public sharing setting (`:sharing?`)."
  [{:chart-route "/card/:uuid/query"
    :goal-route  "/card/:uuid/goal-values"
    :params      (fn [{:keys [card-uuid]}] {:uuid card-uuid})
    :cases       {"valid request"
                  {:status 202}

                  "public sharing disabled"
                  {:status 400, :sharing? false}

                  "unknown uuid"
                  {:status 404, :params (fn [_ctx] {:uuid (public-uuid)})}

                  "revoked uuid"
                  {:status 404, :setup (fn [{:keys [card-id]}] (t2/update! :model/Card :id card-id {:public_uuid nil}))}

                  "archived card"
                  {:status 404, :setup (fn [{:keys [card-id]}] (t2/update! :model/Card :id card-id {:archived true}))}}}
   {:chart-route "/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id"
    :goal-route  "/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id/goal-values"
    :params      (fn [{:keys [dash-uuid dashcard-id card-id]}] {:uuid dash-uuid, :dashcard-id dashcard-id, :card-id card-id})
    :cases       {"valid request"
                  {:status 202}

                  "public sharing disabled"
                  {:status 400, :sharing? false}

                  "unknown uuid"
                  {:status 404, :params (fn [_ctx] {:uuid (public-uuid)})}

                  "revoked uuid"
                  {:status 404, :setup (fn [{:keys [dash-id]}] (t2/update! :model/Dashboard :id dash-id {:public_uuid nil}))}

                  "archived dashboard"
                  {:status 404, :setup (fn [{:keys [dash-id]}] (t2/update! :model/Dashboard :id dash-id {:archived true}))}

                  "archived card"
                  {:status 404, :setup (fn [{:keys [card-id]}] (t2/update! :model/Card :id card-id {:archived true}))}

                  "unknown dashcard"
                  {:status 404, :params (fn [_ctx] {:dashcard-id Integer/MAX_VALUE})}

                  "dashcard from another dashboard"
                  {:status 404, :params (fn [{:keys [other-dashcard-id]}] {:dashcard-id other-dashcard-id})}

                  "card not on the dashcard"
                  {:status 404, :params (fn [{:keys [stray-card-id]}] {:card-id stray-card-id})}

                  "unknown card"
                  {:status 404, :params (fn [_ctx] {:card-id Integer/MAX_VALUE})}}}
   {:chart-route "/document/:uuid/card/:card-id"
    :goal-route  "/document/:uuid/card/:card-id/goal-values"
    :params      (fn [{:keys [doc-uuid doc-card-id]}] {:uuid doc-uuid, :card-id doc-card-id})
    :cases       {"valid request"
                  {:status 202}

                  "public sharing disabled"
                  {:status 400, :sharing? false}

                  "unknown uuid"
                  {:status 404, :params (fn [_ctx] {:uuid (public-uuid)})}

                  "revoked uuid"
                  {:status 404, :setup (fn [{:keys [doc-id]}] (t2/update! :model/Document :id doc-id {:public_uuid nil}))}

                  "archived document"
                  {:status 404, :setup (fn [{:keys [doc-id]}] (t2/update! :model/Document :id doc-id {:archived true}))}

                  "archived card"
                  {:status 404, :setup (fn [{:keys [doc-card-id]}] (t2/update! :model/Card :id doc-card-id {:archived true}))}

                  "card not in the document"
                  {:status 404, :params (fn [{:keys [card-id]}] {:card-id card-id})}

                  "unknown card"
                  {:status 404, :params (fn [_ctx] {:card-id Integer/MAX_VALUE})}}}])

(defn- route->url
  "`route` under `/api/public` with its `:param` segments filled from `params`."
  [route params]
  (str "public" (str/replace route #":([a-z-]+)" (fn [[_ k]] (str (get params (keyword k)))))))

(defn- public-get-routes []
  (into #{} (map second) (keys (api.macros/ns-routes 'metabase.public-sharing-rest.api :get))))

(deftest every-goal-route-has-parity-cases-test
  (testing "every public `/goal-values` route is in the parity table, next to its chart route"
    (let [routes (public-get-routes)]
      (is (= (into #{} (filter #(str/ends-with? % "/goal-values")) routes)
             (into #{} (map :goal-route) route-families)))
      (doseq [{:keys [chart-route goal-route]} route-families]
        (testing goal-route
          (is (contains? routes chart-route))
          (is (= (str (str/replace chart-route #"/query$" "") "/goal-values") goal-route)
              "the goal URL is the chart URL plus /goal-values"))))))

(defn- response-status [route params]
  (:status (client/client-full-response :get (route->url route params))))

(deftest chart-and-goal-routes-fail-alike-test
  (doseq [{:keys [chart-route goal-route params cases]} route-families
          [case-name {:keys [status setup sharing?] overrides :params, :or {sharing? true}}] cases]
    (testing (format "%s vs %s: %s" chart-route goal-route case-name)
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (do-with-public-charts
         (fn [ctx]
           (when setup (setup ctx))
           (let [params (merge (params ctx) (when overrides (overrides ctx)))]
             (mt/with-temporary-setting-values [enable-public-sharing sharing?]
               (let [chart-status (response-status chart-route params)
                     goal-status  (response-status goal-route params)]
                 (is (= status chart-status) "chart route")
                 (is (= chart-status goal-status) "goal route matches the chart route"))))))))))
