(ns metabase.test.integrations.ldap
  (:require
   [clojure.java.io :as io]
   [metabase.test.util :as tu]
   [metabase.util :as u])
  (:import
   (com.unboundid.ldap.listener InMemoryDirectoryServer InMemoryDirectoryServerConfig InMemoryListenerConfig)
   (com.unboundid.ldap.sdk.schema Schema)
   (com.unboundid.ldif LDIFReader)
   (java.io File FileNotFoundException)))

(set! *warn-on-reflection* true)

(def ^:dynamic ^InMemoryDirectoryServer *ldap-server*
  "An in-memory LDAP testing server."
  nil)

(defn- get-server-config
  ^InMemoryDirectoryServerConfig [schema]
  (doto (InMemoryDirectoryServerConfig. (u/varargs String ["dc=metabase,dc=com"]))
    (.addAdditionalBindCredentials "cn=Directory Manager" "password")
    (.setSchema schema)
    (.setListenerConfigs (u/varargs InMemoryListenerConfig [(InMemoryListenerConfig/createLDAPConfig "LDAP" 0)]))))

(defn- start-ldap-server!
  ^InMemoryDirectoryServer [{:keys [ldif-resource schema]}]
  (let [^File file (or (io/file (str "test_resources/" ldif-resource))
                       (throw
                        (FileNotFoundException. (str ldif-resource " does not exist!"))))]
    (with-open [ldif (LDIFReader. file)]
      (doto (InMemoryDirectoryServer. (get-server-config schema))
        (.importFromLDIF true ldif)
        (.startListening)))))

(defn get-ldap-port
  "Get the port for the bound in-memory LDAP testing server."
  []
  (.getListenPort *ldap-server*))

(defn get-ldap-details []
  {:host       "localhost"
   :port       (get-ldap-port)
   :bind-dn    "cn=Directory Manager"
   :password   "password"
   :security   :none
   :user-base  "dc=metabase,dc=com"
   :group-base "dc=metabase,dc=com"})

(defn get-default-schema
  "Get the default schema for the directory server."
  []
  (Schema/mergeSchemas
   (u/varargs Schema [(Schema/getDefaultStandardSchema)
                      (Schema/getSchema (u/varargs File [(io/file "test_resources/posixGroup.schema.ldif")]))])))

(defn do-with-ldap-server
  "Bind `*ldap-server*` and the relevant settings to an in-memory LDAP testing server and executes `f`."
  [f options]
  (binding [*ldap-server* (start-ldap-server! options)]
    (try
      (tu/with-temporary-setting-values [ldap-host       "localhost"
                                         ldap-port       (get-ldap-port)
                                         ldap-bind-dn    "cn=Directory Manager"
                                         ldap-password   "password"
                                         ldap-user-base  "dc=metabase,dc=com"
                                         ldap-group-sync true
                                         ldap-group-base "dc=metabase,dc=com"]
         (tu/with-temporary-raw-setting-values [ldap-enabled "true"]
          (f)))
      (finally (.shutDown *ldap-server* true)))))

(defmacro with-ldap-server
  "Bind `*ldap-server*` and the relevant settings to an in-memory LDAP testing server and executes `body`."
  [& body]
  `(do-with-ldap-server (fn [] ~@body)
                        {:ldif-resource "ldap.ldif"
                         :schema        (get-default-schema)}))

(defmacro with-active-directory-ldap-server
  "Bind `*ldap-server*` and the relevant settings to an in-memory LDAP testing server and executes `body`.
  This version of the macro uses options that simulate an Active Directory server with memberOf attributes."
  [& body]
  `(do-with-ldap-server (fn [] ~@body)
                        {:ldif-resource "active_directory.ldif"
                         :schema        nil}))
