(ns metabase.integrations.ldap
  (:require [clojure.string :as s]
            [clj-ldap.client :as ldap]
            (metabase.models [setting :refer [defsetting], :as setting])))

(defsetting ldap-enabled
  "Enable LDAP authentication."
  :type    :boolean
  :default false)

(defsetting ldap-host
  "Server hostname.")

(defsetting ldap-port
  "Server port, usually 389 or 636 if SSL is used."
  :default "389")

(defsetting ldap-security
  "Use SSL, TLS or plain text."
  :default "none"
  :setter  (fn [new-value]
             (when-not (nil? new-value)
               (assert (contains? #{"none" "ssl" "starttls"} new-value)))
             (setting/set-string! :ldap-security new-value)))

(defsetting ldap-bind-dn
  "The DN to bind as, this user will be used to lookup information about other users.")

(defsetting ldap-password
  "The password to bind with.")

(defsetting ldap-base
  "Search base for users. (Will be searched recursively)")

(defsetting ldap-user-filter
  "Filter to use for looking up a specific user, the placeholder {login} will be replaced by the user supplied login."
  :default "(&(objectClass=inetOrgPerson)(|(uid={login})(mail={login})))")

(defsetting ldap-attribute-email
  "Attribute to use for the user's email. (i.e.: 'mail', 'email' or 'userPrincipalName')"
  :default "mail")

(defsetting ldap-attribute-firstname
  "Attribute to use for the user's first name. (i.e.: 'givenName')"
  :default "givenName")

(defsetting ldap-attribute-lastname
  "Attribute to use for the user's last name. (i.e.: 'sn')"
  :default "sn")

(defn ldap-configured?
  "Check if LDAP is enabled and that the mandatory settings are configured."
  []
  (and (ldap-enabled)
       (boolean (ldap-host))
       (boolean (ldap-bind-dn))
       (boolean (ldap-password))
       (boolean (ldap-base))))

(defn- details->ldap-options [{:keys [host port bind-dn password security]}]
  {:host      (str host ":" port)
   :bind-dn   bind-dn
   :password  password
   :ssl?      (= security "ssl")
   :startTLS? (= security "starttls")})

(defn- settings->ldap-options []
  (details->ldap-options {:host      (ldap-host)
                          :port      (ldap-port)
                          :bind-dn   (ldap-bind-dn)
                          :password  (ldap-password)
                          :security  (ldap-security)}))

(defn test-ldap-connection
  "Test the connection to an LDAP server to determine if we can find the search base.

   Takes in a dictionary of properties such as:
       {:host     \"localhost\"
        :port     389
        :bind-dn  \"cn=Directory Manager\"
        :password \"password\"
        :security \"none\"
        :base     \"ou=people,dc=metabase,dc=com\"}"
  [{:keys [base], :as details}]
  (try
    (with-open [conn (ldap/connect (details->ldap-options details))]
      (if-let [_ (ldap/get conn base)]
        {:status  :SUCCESS}
        {:status  :ERROR
         :message "Search base does not exist or is unreadable"}))
    (catch com.unboundid.util.LDAPSDKException e
      {:status  :ERROR
       :message (.getMessage e)})))

(defn- get-ldap-connection []
  "Connects to LDAP with the currently set settings and returns the connection."
  (ldap/connect (settings->ldap-options)))

(defn- with-connection [f & args]
  "Applies `f` with a connection pool followed by `args`"
  (with-open [conn (get-ldap-connection)]
    (apply f conn args)))

(defn- escape-value [value]
  "Escapes a value for use in an LDAP filter expression."
  (s/replace value #"[\*\(\)\\\\0]" (comp (partial format "\\%02X") int first)))

(defn find-user
  "Gets user information for the supplied username."
  ([username]
    (with-connection find-user username))
  ([conn username]
    (let [fname-attr (keyword (ldap-attribute-firstname))
          lname-attr (keyword (ldap-attribute-lastname))
          email-attr (keyword (ldap-attribute-email))]
      (when-let [[result] (ldap/search conn (ldap-base) {:scope      :sub
                                                         :filter     (s/replace (ldap-user-filter) "{login}" (escape-value username))
                                                         :attributes [:dn :distinguishedName :membderOf fname-attr lname-attr email-attr]
                                                         :size-limit 1})]
        (let [dn    (or (:dn result) (:distinguishedName result))
              fname (get result fname-attr)
              lname (get result lname-attr)
              email (get result email-attr)]
          (when-not (or (empty? dn) (empty? fname) (empty? lname) (empty? email))
            {:dn         dn
             :first-name fname
             :last-name  lname
             :email      email
             :groups     (or (:membderOf result) [])}))))))

(defn verify-password
  "Verifies if the password supplied is valid for the supplied `user-info` (from `find-user`) or DN."
  ([user-info password]
    (with-connection verify-password user-info password))
  ([conn user-info password]
    (if (string? user-info)
      (ldap/bind? conn user-info password)
      (ldap/bind? conn (:dn user-info) password))))
