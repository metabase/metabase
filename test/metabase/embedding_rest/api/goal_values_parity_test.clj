(ns metabase.embedding-rest.api.goal-values-parity-test
  "Each embed and preview `/goal-values` route must succeed exactly when its chart route does: both go through the same
  context resolver. Sends the same bad input to each chart route and its goal route and compares the responses."
  {:clj-kondo/config '{:linters {:discouraged-var {metabase.test/with-temp {:level :off}}}}}
  (:require
   [buddy.sign.jwt :as jwt]
   [buddy.sign.util :as buddy-util]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.embedding-rest.api.embed-test :as embed-test]
   [metabase.test :as mt]))

(def ^:private embedding-params
  {:tenant "locked" :price "disabled"})

(defn- variable [tag-name]
  {:id tag-name :name tag-name :display-name tag-name :type :number})

(def ^:private route-pairs
  "Each chart route and its goal route, as fns of the signed token and the fixture."
  {:embed-card       {:preview? false
                      :chart    (fn [token _] (str "embed/card/" token "/query"))
                      :goal     (fn [token _] (str "embed/card/" token "/goal-values"))}
   :embed-dashcard   {:preview? false
                      :dashcard? true
                      :chart    (fn [token {:keys [dashcard-id card-id]}]
                                  (format "embed/dashboard/%s/dashcard/%d/card/%d" token dashcard-id card-id))
                      :goal     (fn [token {:keys [dashcard-id card-id]}]
                                  (format "embed/dashboard/%s/dashcard/%d/card/%d/goal-values" token dashcard-id card-id))}
   :preview-card     {:preview? true
                      :chart    (fn [token _] (str "preview_embed/card/" token "/query"))
                      :goal     (fn [token _] (str "preview_embed/card/" token "/goal-values"))}
   :preview-dashcard {:preview? true
                      :dashcard? true
                      :chart    (fn [token {:keys [dashcard-id card-id]}]
                                  (format "preview_embed/dashboard/%s/dashcard/%d/card/%d" token dashcard-id card-id))
                      :goal     (fn [token {:keys [dashcard-id card-id]}]
                                  (format "preview_embed/dashboard/%s/dashcard/%d/card/%d/goal-values"
                                          token dashcard-id card-id))}})

(def ^:private cases
  "Bad inputs. `:claims` updates the token claims, `:sign` replaces signing, `:around` (fn [thunk fixture]) wraps the
  requests, `:fixture` updates the fixture. `:expected` is the status both routes must return, by pair or for all of them."
  [{:label    "valid token"
    :expected 202}
   {:label    "embedding disabled"
    :around   (fn [thunk _fixture] (mt/with-temporary-setting-values [enable-embedding-modular false] (thunk)))
    :expected 400}
   {:label    "bad signature"
    :sign     (fn [claims] (jwt/sign claims (embed-test/random-embedding-secret-key)))
    :expected 400}
   {:label    "expired token"
    :claims   #(assoc % :exp (buddy-util/to-timestamp (t/minus (t/instant) (t/days 1))))
    :expected 400}
   {:label    "enable_embedding false"
    :around   (fn [thunk {:keys [card-id dashboard-id]}]
                (mt/with-temp-vals-in-db :model/Card card-id {:enable_embedding false}
                  (mt/with-temp-vals-in-db :model/Dashboard dashboard-id {:enable_embedding false}
                    (thunk))))
    ;; previews ignore `enable_embedding`
    :expected {:embed-card 400, :embed-dashcard 400, :preview-card 202, :preview-dashcard 202}}
   {:label    "archived card"
    :around   (fn [thunk {:keys [card-id]}]
                (mt/with-temp-vals-in-db :model/Card card-id {:archived true}
                  (thunk)))
    :expected {:embed-card 400, :embed-dashcard 400, :preview-card 202, :preview-dashcard 404}}
   {:label     "dashcard from another dashboard"
    :dashcard? true
    :fixture   #(assoc % :dashcard-id (:other-dashcard-id %))
    :expected  {:embed-dashcard 400, :preview-dashcard 404}}
   {:label     "card not on the dashcard"
    :dashcard? true
    :fixture   #(assoc % :card-id (:goal-id %))
    :expected  {:embed-dashcard 400, :preview-dashcard 404}}
   {:label    "token missing a locked param"
    :claims   #(assoc % :params {})
    :expected 400}
   {:label    "token with a disabled param"
    :claims   #(assoc % :params {:tenant 7 :price 4})
    :expected 400}
   {:label    "token with an unknown param"
    :claims   #(assoc % :params {:tenant 7 :nope 1})
    :expected 400}
   {:label    "non-superuser"
    :user     :rasta
    ;; embed routes ignore the session
    :expected {:embed-card 202, :embed-dashcard 202, :preview-card 403, :preview-dashcard 403}}])

(defn- base-claims [{:keys [preview? dashcard?]} {:keys [card-id dashboard-id]}]
  (cond-> {:resource (if dashcard? {:dashboard dashboard-id} {:question card-id})
           :params   {:tenant 7}}
    preview? (assoc :_embedding_params embedding-params)))

(defn- request [user url]
  (mt/user-http-request-full-response user :get url))

(deftest goal-route-parity-test
  (embed-test/with-embedding-enabled-and-new-secret-key!
    (mt/with-temp [:model/Card      {goal-id :id}  {:dataset_query (mt/native-query
                                                                    {:query "SELECT COUNT(*) AS \"count\" FROM venues"})}
                   :model/Card      {card-id :id}  {:enable_embedding       true
                                                    :embedding_params       embedding-params
                                                    :display                :scalar
                                                    :dataset_query          (mt/native-query
                                                                             {:query         (str "SELECT COUNT(*) AS \"count\" FROM venues WHERE 1 = 1"
                                                                                                  " [[AND category_id = {{tenant}}]]"
                                                                                                  " [[AND price = {{price}}]]")
                                                                              :template-tags {"tenant" (variable "tenant")
                                                                                              "price"  (variable "price")}})
                                                    :visualization_settings {:scalar.segments [{:min   {:id goal-id :type "card" :column "count"}
                                                                                                :max   nil
                                                                                                :color "red"}]}}
                   :model/Dashboard {dashboard-id :id} {:enable_embedding true
                                                        :embedding_params embedding-params
                                                        :parameters       [{:id "_T_" :name "Tenant" :slug "tenant" :type "number/="}
                                                                           {:id "_P_" :name "Price" :slug "price" :type "number/="}]}
                   :model/DashboardCard {dashcard-id :id} {:dashboard_id       dashboard-id
                                                           :card_id            card-id
                                                           :parameter_mappings [{:parameter_id "_T_"
                                                                                 :card_id      card-id
                                                                                 :target       [:variable [:template-tag "tenant"]]}]}
                   :model/Dashboard {other-dashboard-id :id} {:enable_embedding true}
                   :model/DashboardCard {other-dashcard-id :id} {:dashboard_id other-dashboard-id
                                                                 :card_id      card-id}]
      (let [fixture {:goal-id           goal-id
                     :card-id           card-id
                     :dashboard-id      dashboard-id
                     :dashcard-id       dashcard-id
                     :other-dashcard-id other-dashcard-id}]
        (doseq [{:keys [label claims sign around user expected] :as bad-input} cases
                [pair-name {:keys [chart goal] :as pair}] route-pairs
                :let [expected (if (map? expected) (get expected pair-name) expected)]
                :when (and (some? expected)
                           (or (not (:dashcard? bad-input)) (:dashcard? pair)))]
          (testing (format "%s, %s" label pair-name)
            (let [fixture (cond-> fixture (:fixture bad-input) ((:fixture bad-input)))
                  token   ((or sign embed-test/sign) ((or claims identity) (base-claims pair fixture)))
                  user    (or user :crowberto)
                  run     (fn []
                            [(request user (chart token fixture))
                             (request user (goal token fixture))])
                  [chart-response goal-response] (if around
                                                   (around run fixture)
                                                   (run))]
              (is (= expected (:status chart-response)) "chart route")
              (is (= (:status chart-response) (:status goal-response)) "goal route matches the chart route")
              (when (and (not= 202 expected) (string? (:body chart-response)))
                (is (= (:body chart-response) (:body goal-response)) "same error message")))))))))

(deftest tenant-signed-token-withholds-on-every-route-test
  (testing "a token that signs a tenant value gets a 202 with every goal withheld, on every goal route"
    (embed-test/with-embedding-enabled-and-new-secret-key!
      (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/native-query
                                                                {:query "SELECT COUNT(*) AS \"count\" FROM venues"})}
                     :model/Card {card-id :id} {:enable_embedding       true
                                                :embedding_params       {:tenant "locked"}
                                                :display                :scalar
                                                :dataset_query          (mt/native-query
                                                                         {:query         (str "SELECT COUNT(*) AS \"count\" FROM venues"
                                                                                              " WHERE 1 = 1 [[AND category_id = {{tenant}}]]")
                                                                          :template-tags {"tenant" (variable "tenant")}})
                                                :visualization_settings {:scalar.segments [{:min   {:id goal-id :type "card" :column "count"}
                                                                                            :max   nil
                                                                                            :color "red"}]}}
                     :model/Dashboard {dashboard-id :id} {:enable_embedding true
                                                          :embedding_params {:tenant "locked"}
                                                          :parameters       [{:id "_T_" :name "Tenant" :slug "tenant" :type "number/="}]}
                     :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id :card_id card-id}]
        (let [fixture {:card-id card-id :dashboard-id dashboard-id :dashcard-id dashcard-id}]
          (doseq [[pair-name {:keys [goal preview?] :as pair}] route-pairs]
            (testing pair-name
              (let [claims (cond-> (base-claims pair fixture)
                             preview? (assoc :_embedding_params {:tenant "locked"}))]
                (is (= {:card {goal-id {:status "failed" :error_type "withheld"}}}
                       (mt/user-http-request :crowberto :get 202 (goal (embed-test/sign claims) fixture))))))))))))
