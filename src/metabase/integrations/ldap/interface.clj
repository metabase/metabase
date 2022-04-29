(ns metabase.integrations.ldap.interface
  "There are separate EE and OSS versions of the LDAP integration; this namespace defines a common protocol both
  implementations conform to."
  (:require [metabase.plugins.classloader :as classloader]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s])
  (:import com.unboundid.ldap.sdk.DN))

;; Load the EE namespace up front so that the extra Settings it defines are available immediately.
;; Otherwise, this would only happen the first time one of the functions defined using `defenterprise` is called.
(u/ignore-exceptions (classloader/require ['metabase-enterprise.enhancements.integrations.ldap]))

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
