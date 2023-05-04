;;
;; Licensed under the Apache License, Version 2.0 (the "License");
;; you may not use this file except in compliance with the License.
;; You may obtain a copy of the License at
 
;;     http://www.apache.org/licenses/LICENSE-2.0
 
;; Unless required by applicable law or agreed to in writing, software
;; distributed under the License is distributed on an "AS IS" BASIS,
;; WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
;; See the License for the specific language governing permissions and
;; limitations under the License.
;;
(ns metabase.driver.implementation.connectivity
  "Connectivity implementation for Starburst driver."
  (:require [clojure.set :as set]
            [clojure.string :as str]
            [metabase.db.spec :as mdb.spec]
            [metabase.driver.sql-jdbc.common :as sql-jdbc.common]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.util.i18n :refer [trs]]))

(defn- db-name
  "Creates a \"DB name\" for the given catalog `c` and (optional) schema `s`.  If both are specified, a slash is
  used to separate them.  See examples at:
  https://trino.io/docs/current/installation/jdbc.html#connecting"
  [c s]
  (cond
    (str/blank? c)
    ""

    (str/blank? s)
    c

    :else
    (str c "/" s)))

;;; Kerberos related definitions
(def ^:private ^:const kerb-props->url-param-names
  {:kerberos-principal "KerberosPrincipal"
   :kerberos-remote-service-name "KerberosRemoteServiceName"
   :kerberos-use-canonical-hostname "KerberosUseCanonicalHostname"
   :kerberos-credential-cache-path "KerberosCredentialCachePath"
   :kerberos-keytab-path "KerberosKeytabPath"
   :kerberos-service-principal-pattern "KerberosServicePrincipalPattern"
   :kerberos-config-path "KerberosConfigPath"
   :kerberos-delegation "KerberosDelegation"})

(defn- details->kerberos-url-params [details]
  (let [remove-blank-vals (fn [m] (into {} (remove (comp str/blank? val) m)))
        ks                (keys kerb-props->url-param-names)]
    (-> (select-keys details ks)
        remove-blank-vals
        (set/rename-keys kerb-props->url-param-names))))

(defn- prepare-roles [{:keys [roles] :as details}]
  (if (str/blank? roles)
    (dissoc details :roles)
    (assoc details :roles (str "system:" roles))
  )
)

(defn- prepare-addl-opts [{:keys [SSL kerberos additional-options] :as details}]
  (let [det (if kerberos
              (if-not SSL
                (throw (ex-info (trs "SSL must be enabled to use Kerberos authentication")
                                {:db-details details}))
                (update details
                        :additional-options
                        str
                        ;; add separator if there are already additional-options
                        (when-not (str/blank? additional-options) "&")
                        ;; convert Kerberos options map to URL string
                        (sql-jdbc.common/additional-opts->string :url (details->kerberos-url-params details))))
              details)]
    ;; in any case, remove the standalone Kerberos properties from details map
    (apply dissoc (cons det (keys kerb-props->url-param-names)))))

(defn- jdbc-spec
  "Creates a spec for `clojure.java.jdbc` to use for connecting to Starburst via JDBC, from the given `opts`."
       [{:keys [host port catalog schema roles]
    :or   {host "localhost", port 5432, catalog ""}
    :as   details}]
  (-> details
      (merge {:classname   "io.trino.jdbc.TrinoDriver"
              :subprotocol "trino"
              :subname     (mdb.spec/make-subname host port (db-name catalog schema))})
      prepare-addl-opts
      prepare-roles
      (dissoc :host :port :db :catalog :schema :tunnel-enabled :engine :kerberos)
      sql-jdbc.common/handle-additional-options))

(defn- str->bool [v]
  (if (string? v)
    (Boolean/parseBoolean v)
    v))

(defn- bool->str [v]
  (if (boolean? v)
    (str v)
    v))

(defmethod sql-jdbc.conn/connection-details->spec :starburst
  [_ details-map]
  (let [props (-> details-map
                  (update :port (fn [port]
                                  (if (string? port)
                                    (Integer/parseInt port)
                                    port)))
                  (update :ssl str->bool)
                  (update :kerberos str->bool)
                  (update :kerberos-delegation bool->str)
                  (assoc :SSL (:ssl details-map))
                  (assoc :source "Starburst Metabase 2.0.0")

                ;; remove any Metabase specific properties that are not recognized by the Trino JDBC driver, which is
                ;; very picky about properties (throwing an error if any are unrecognized)
                ;; all valid properties can be found in the JDBC Driver source here:
                ;; https://trino.io/docs/current/installation/jdbc.html#parameter-reference
                  (select-keys (concat
                                [:host :port :catalog :schema :additional-options ; needed for `jdbc-spec`
                               ;; JDBC driver specific properties
                                 :kerberos ; we need our boolean property indicating if Kerberos is enabled, but the rest of them come from `kerb-props->url-param-names` (below)
                                 :user :password :sessionUser :socksProxy :httpProxy :clientInfo :clientTags :traceToken
                                 :source :applicationNamePrefix ::accessToken :SSL :SSLVerification :SSLKeyStorePath
                                 :SSLKeyStorePassword :SSLKeyStoreType :SSLTrustStorePath :SSLTrustStorePassword :SSLTrustStoreType :SSLUseSystemTrustStore
                                 :extraCredentials :roles :sessionProperties :externalAuthentication :externalAuthenticationTokenCache :disableCompression 
                                 :assumeLiteralNamesInMetadataCallsForNonConformingClients]
                                (keys kerb-props->url-param-names))))]
    (jdbc-spec props)))
