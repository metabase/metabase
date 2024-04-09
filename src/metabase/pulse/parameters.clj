(ns metabase.pulse.parameters
  "Utilities for processing parameters for inclusion in dashboard subscriptions."
  (:require
   [clojure.string :as str]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.shared.parameters.parameters :as shared.params]
   [metabase.util :as u]
   [metabase.util.urls :as urls]
   [ring.util.codec :as codec]))

(defenterprise the-parameters
  "OSS way of getting filter parameters for a dashboard subscription"
  metabase-enterprise.dashboard-subscription-filters.pulse
  [_pulse dashboard]
  (:parameters dashboard))

(defn- param-val-or-default
  "Returns the parameter value, such that:
    * nil value => nil
    * missing value key => default"
  [parameter]
  (get parameter :value (:default parameter)))

(defn parameters
  "Returns the list of parameters applied to a dashboard subscription, filtering out ones
  without a value"
  [subscription dashboard]
  (filter
   param-val-or-default
   (the-parameters subscription dashboard)))

(defn value-string
  "Returns the value(s) of a dashboard filter, formatted appropriately."
  [parameter]
  (let [tyype  (:type parameter)
        values (param-val-or-default parameter)]
    (try (shared.params/formatted-value tyype values (public-settings/site-locale))
         (catch Throwable _
           (shared.params/formatted-list (u/one-or-many values))))))

(defn dashboard-url
  "Given a dashboard's ID and parameters, returns a URL for the dashboard with filters included"
  [dashboard-id parameters]
  (let [base-url   (urls/dashboard-url dashboard-id)
        url-params (flatten
                    (for [param parameters]
                      (for [value (u/one-or-many (param-val-or-default param))]
                        (str (codec/url-encode (:slug param))
                             "="
                             (codec/url-encode value)))))]
    (str base-url (when (seq url-params)
                    (str "?" (str/join "&" url-params))))))

(defn- escape-markdown-chars?
  "Heading cards should not escape characters."
  [dashcard]
  (not= "heading" (get-in dashcard [:visualization_settings :virtual_card :display])))

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
    (update-in dashcard [:visualization_settings :text] shared.params/substitute-tags tag->param (public-settings/site-locale) (escape-markdown-chars? dashcard))))
