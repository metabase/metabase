(ns metabase.integrations.ldap
  (:require [clojure.string :as s]
            [clj-ldap.client :as ldap]
            (metabase.models [setting :refer [defsetting], :as setting])))

(defsetting ldap-host
  "LDAP server hostname.")

(defsetting ldap-port
  "Server port, usually 389 or 636 if SSL is used."
  :default "389")

(defsetting ldap-security
  "Use SSL, TLS or plain text."
  :default "none"
  :setter  (fn [new-value]
             (when-not (nil? new-value)
               (assert (contains? #{"none" "ssl" "tls"} new-value)))
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
  "Check if LDAP is configured (enough)."
  []
  ;; TODO - This is fine and all, but should we instead have a toggle to "Enabled LDAP? Yes/No"
  (and (boolean (ldap-host))
       (boolean (ldap-bind-dn))
       (boolean (ldap-password))
       (boolean (ldap-base))))

(defn- ldap-connection []
  (ldap/connect {:host      (str (ldap-host) ":" (ldap-port))
                 :bind-dn   (ldap-bind-dn)
                 :password  (ldap-password)
                 :ssl?      (= (ldap-security) "ssl")
                 :startTLS? (= (ldap-security) "tls")}))

(defn- with-connection [f & args]
  "Applies `f` with a connection pool followed by `args`"
  (let [conn (ldap-connection)]
    (try
      (apply f conn args)
      (finally (ldap/close conn)))))

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
                                                         :attributes [:dn :distinguishedName fname-attr lname-attr email-attr]
                                                         :size-limit 1})]
        {:dn         (or (:dn result) (:distinguishedName result)) ; TODO - Check if AD also provides "dn"
         :first-name (get result fname-attr)
         :last-name  (get result lname-attr)
         :email      (get result email-attr)}))))

(defn auth-user
  "Authenticates the user with an LDAP bind operation. Returns the user information when successful, nil otherwise."
  ([username password]
    (with-connection auth-user username password))
  ([conn username password]
    ;; first figure out the user even exists, we also need the DN to reliably bind with LDAP
    (when-let [{:keys [dn], :as user} (find-user conn username)]
      ;; then try a bind with the DN we got and the supplied password
      (when (ldap/bind? conn dn password)
        user))))

(defn verify-password
  "Verifies if the password supplied is correct. `user-info` is what `find-user` returns (alternarively only the :dn needs to be filled in)"
  ([user-info password]
    (with-connection verify-password user-info password))
  ([conn {:keys [dn]} password]
    (ldap/bind? conn dn password)))
