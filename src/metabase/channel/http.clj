(ns metabase.channel.http
  (:require
   [clj-http.client :as http]
   [metabase.channel.core :as channel]
   [metabase.util.malli :as mu]))

(def ^:private string-or-keyword
  [:or :string :keyword])

(def ^:private HTTPPayLoad
  [:map
   [:url                           :string]
   [:method                        [:enum :get :post :put :delete]]
   [:query-params {:optional true} [:maybe [:map-of string-or-keyword string-or-keyword]]]
   [:headers      {:optional true} [:maybe [:map-of string-or-keyword string-or-keyword]]]
   [:body         {:optional true} :string]])

(mu/defmethod channel/send! :channel/http
  [{:keys [url method auth-method auth-info]} request]
  (http/request (merge
                 {:accept       :json
                  :content-type :json
                  :url          url
                  :method       method}
                 (cond-> request
                   (= :header auth-method) (update :headers merge auth-info)
                   (= :query-param auth-method) (update :query-params merge auth-info)))))

(defmethod channel/can-connect? :channel/http
  [_channel-type details]
  (channel/send! (merge {:type :channel/http} details) nil))
