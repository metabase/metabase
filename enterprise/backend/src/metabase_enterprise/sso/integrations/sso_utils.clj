(ns metabase-enterprise.sso.integrations.sso-utils
  "Functions shared by the various SSO implementations"
  (:require
   [clojure.string :as str]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.api.common :as api]
   [metabase.appearance.core :as appearance]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log])
  (:import
   (java.net URI URISyntaxException)))

(set! *warn-on-reflection* true)

(defn- maybe-throw-user-provisioning
  [user-provisioning-type]
  (when (not user-provisioning-type)
    (throw (ex-info (trs "Sorry, but you''ll need a {0} account to view this page. Please contact your administrator."
                         (u/slugify (appearance/site-name))) {:status-code 401}))))

(defmulti check-user-provisioning
  "If `user-provisioning-enabled?` is false, then we should throw an error when attempting to create a new user."
  {:arglists '([model])}
  keyword)

(defmethod check-user-provisioning :saml
  [_]
  (maybe-throw-user-provisioning (sso-settings/saml-user-provisioning-enabled?)))

(defmethod check-user-provisioning :ldap
  [_]
  (maybe-throw-user-provisioning (sso-settings/ldap-user-provisioning-enabled?)))

(defmethod check-user-provisioning :jwt
  [_]
  (maybe-throw-user-provisioning (sso-settings/jwt-user-provisioning-enabled?)))

(defmethod check-user-provisioning :slack-connect
  [_]
  (maybe-throw-user-provisioning (sso-settings/slack-connect-user-provisioning-enabled)))

(defn relative-uri?
  "Checks that given `uri` is not an absolute (so no scheme and no host)."
  [uri]
  (let [^URI uri (if (string? uri)
                   (try
                     (URI. uri)
                     (catch URISyntaxException _
                       nil))
                   uri)]
    (or (nil? uri)
        (and (nil? (.getHost uri))
             (nil? (.getScheme uri))))))

(defn check-sso-redirect
  "Check if open redirect is being exploited in SSO. If so, or if the redirect-url is invalid, throw a 400."
  [redirect-url]
  (try
    (let [redirect (some-> redirect-url (URI.))
          our-host (some-> (system/site-url) (URI.) (.getHost))]
      (api/check-400 (or (nil? redirect-url)
                         (relative-uri? redirect)
                         (= (.getHost redirect) our-host)))
      redirect-url)
    (catch Exception e
      (log/error e "Invalid redirect URL")
      (throw (ex-info (tru "Invalid redirect URL")
                      {:status-code  400
                       :redirect-url redirect-url})))))

(defn stringify-valid-attributes
  "Remove all invalid attributes from passed user attributes, make sure all the remaining keys and values are strings"
  [attrs]
  (->> attrs
       (keep (fn [[key value]]
               (cond
                 (or (vector? value) (map? value) (nil? value))
                 (log/warnf "Dropping attribute '%s' with non-stringable value: %s" (name key) value)

                 (str/starts-with? (name key) "@")
                 (log/warnf "Dropping attribute '%s', keys beginning with `@` are reserved" (name key))

                 :else
                 [(u/qualified-name key) (str value)])))
       (into {})))
