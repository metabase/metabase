(ns metabase.integrations.ldap.interface
  "There are separate EE and OSS versions of the LDAP integration; this namespace defines a common protocol both
  implementations conform to."
  (:require [metabase.util.schema :as su]
            [potemkin :as p]
            [schema.core :as s])
  (:import com.unboundid.ldap.sdk.DN))

(def UserInfo
  "Schema for LDAP User info as returned by `user-info` and used as input to `fetch-or-create-user!`."
  {:dn         su/NonBlankString
   :first-name (s/maybe su/NonBlankString)
   :last-name  (s/maybe su/NonBlankString)
   :email      su/Email
   :groups     [su/NonBlankString]
   s/Keyword   s/Any})

(def LDAPSettings
  "Options passed to LDAP integration implementations. These are just the various LDAP Settings from
  `metabase.integrations.ldap`, packaged up as a single map so implementations don't need to fetch Setting values
  directly."
  {:first-name-attribute su/NonBlankString
   :last-name-attribute  su/NonBlankString
   :email-attribute      su/NonBlankString
   :sync-groups?         s/Bool
   :user-base            su/NonBlankString
   :user-filter          su/NonBlankString
   :group-base           (s/maybe su/NonBlankString)
   :group-mappings       (s/maybe {DN [su/IntGreaterThanZero]})
   s/Keyword             s/Any})

(p/defprotocol+ LDAPIntegration
  "Protocol for LDAP integration implementations."
  (find-user [this ^com.unboundid.ldap.sdk.LDAPConnectionPool ldap-connection username ldap-settings]
    "Find LDAP user with `username`. If a corresponding LDAP user is found, result should be in the format specified
  by the `UserInfo` schema above. `ldap-settings` match the `LDAPSettings` schema above.")

  (fetch-or-create-user! [this user-info ldap-settings]
    "Using the `user-info` (from `find-user`) get the corresponding Metabase user, creating it if necessary.
    `ldap-settings` match the `LDAPSettings` schema above."))
