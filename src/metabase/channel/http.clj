(ns metabase.channel.http
  (:require
   [clj-http.client :as http]
   [metabase.channel.core :as channel]
   [metabase.channel.shared :as channel.shared]
   [metabase.util.malli :as mu]))

(def ^:private string-or-keyword
  [:or :string :keyword])

(def ^:private HTTPDetails
  [:map
   [:url                           :string]
   [:auth-method                   [:enum :none :header :query-param :request-body]]
   [:method       {:optional true} [:enum :get :post :put]]
   [:query-params {:optional true} [:maybe [:map-of string-or-keyword :any]]]
   [:headers      {:optional true} [:maybe [:map-of string-or-keyword :any]]]
   [:body         {:optional true} :string]])

(mu/defmethod channel/send! :channel/http
  [{:keys [url method auth-method auth-info]} :- HTTPDetails
   request]
  (http/request (merge
                 {:accept       :json
                  :content-type :json
                  :method       :post}
                 {:url    url
                  :method method}
                 (cond-> request
                   (= :request-body auth-method) (update :body merge auth-info)
                   (= :header auth-method)       (update :headers merge auth-info)
                   (= :query-param auth-method)  (update :query-params merge auth-info)))))

(defmethod channel/can-connect?* :channel/http
  [_channel-type details]
  (channel.shared/validate-channel-details HTTPDetails details)
  (channel/send! (merge {:type :channel/http} details) {}))
