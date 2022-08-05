(ns metabase.pulse.parameters
  "Utilities for processing parameters for inclusion in dashboard subscriptions."
  (:require [clojure.string :as str]
            [metabase.public-settings :as public-settings]
            [metabase.public-settings.premium-features :refer [defenterprise]]
            [metabase.shared.parameters.parameters :as shared.params]
            [metabase.util :as u]
            [metabase.util.urls :as urls]
            [ring.util.codec :as codec]))

(defenterprise the-parameters
  "OSS way of getting filter parameters for a dashboard subscription"
  metabase-enterprise.pulse
  [_pulse dashboard]
  (:parameters dashboard))

(defn parameters
  "Returns the list of parameters applied to a dashboard subscription, filtering out ones
  without a value"
  [subscription dashboard]
  (filter
   #(or (:value %) (:default %))
   (the-parameters subscription dashboard)))

(defn value-string
  "Returns the value(s) of a dashboard filter, formatted appropriately."
  [parameter]
  (let [tyype  (:type parameter)
        values (or (:value parameter) (:default parameter))]
    (try (shared.params/formatted-value tyype values (public-settings/site-locale))
         (catch Throwable _
           (shared.params/formatted-list (u/one-or-many values))))))

(defn dashboard-url
  "Given a dashboard's ID and parameters, returns a URL for the dashboard with filters included"
  [dashboard-id parameters]
  (let [base-url   (urls/dashboard-url dashboard-id)
        url-params (flatten
                    (for [param parameters]
                      (for [value (u/one-or-many (or (:value param) (:default param)))]
                        (str (codec/url-encode (:slug param))
                             "="
                             (codec/url-encode value)))))]
    (str base-url (when (seq url-params)
                    (str "?" (str/join "&" url-params))))))

(defn process-virtual-dashcard
  "Given a dashcard and the parameters on a dashboard, returns the dashcard with any parameter values appropriately
  substituted into connected variables in the text."
  [dashcard parameters]
  (let [text               (-> dashcard :visualization_settings :text)
        parameter-mappings (:parameter_mappings dashcard)
        tag-names          (shared.params/tag_names text)
        param-id->param    (into {} (map (juxt :id identity) parameters))
        tag-name->param-id (into {} (map (juxt (comp second :target) :parameter_id) parameter-mappings))
        tag->param         (reduce (fn [m tag-name]
                                     (when-let [param-id (get tag-name->param-id tag-name)]
                                       (assoc m tag-name (get param-id->param param-id))))
                                   {}
                                   tag-names)]
    (update-in dashcard [:visualization_settings :text] shared.params/substitute_tags tag->param (public-settings/site-locale))))
