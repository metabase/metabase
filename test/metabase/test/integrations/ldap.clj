(ns metabase.test.integrations.ldap
  (:require [clojure.java.io :as io]
            [metabase.test.util :as tu])
  (:import [com.unboundid.ldap.listener InMemoryDirectoryServer InMemoryDirectoryServerConfig InMemoryListenerConfig]
           com.unboundid.ldap.sdk.schema.Schema
           com.unboundid.ldif.LDIFReader
           java.io.FileNotFoundException))

(def ^:dynamic *ldap-server*
  "An in-memory LDAP testing server."
  nil)

(defn- get-server-config
  [schema]
  (doto (InMemoryDirectoryServerConfig. (into-array String ["dc=metabase,dc=com"]))
    (.addAdditionalBindCredentials "cn=Directory Manager" "password")
    (.setSchema schema)
    (.setListenerConfigs (into-array InMemoryListenerConfig [(InMemoryListenerConfig/createLDAPConfig "LDAP" 0)]))))

(defn- start-ldap-server!
  [{:keys [ldif-resource schema]}]
  (with-open [ldif (LDIFReader. (or (io/file (str "test_resources/" ldif-resource))
                                    (throw
                                     (FileNotFoundException. (str ldif-resource " does not exist!")))))]
    (doto (InMemoryDirectoryServer. (get-server-config schema))
      (.importFromLDIF true ldif)
      (.startListening))))

(defn get-ldap-port
  "Get the port for the bound in-memory LDAP testing server."
  []
  (.getListenPort *ldap-server*))

(defn get-default-schema
  "Get the default schema for the directory server."
  []
  (Schema/mergeSchemas
   (into-array Schema [(Schema/getDefaultStandardSchema)
                       (Schema/getSchema [(io/file "test_resources/posixGroup.schema.ldif")])])))

(defn do-with-ldap-server
  "Bind `*ldap-server*` and the relevant settings to an in-memory LDAP testing server and executes `f`."
  [f options]
  (binding [*ldap-server* (start-ldap-server! options)]
    (try
      (tu/with-temporary-setting-values [ldap-enabled    true
                                         ldap-host       "localhost"
                                         ldap-port       (str (get-ldap-port))
                                         ldap-bind-dn    "cn=Directory Manager"
                                         ldap-password   "password"
                                         ldap-user-base  "dc=metabase,dc=com"
                                         ldap-group-sync true
                                         ldap-group-base "dc=metabase,dc=com"]
        (f))
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
