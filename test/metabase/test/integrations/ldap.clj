(ns metabase.test.integrations.ldap
  (:require [clojure.java.io :as io]
            [expectations :refer [expect]]
            [metabase.test.util :as tu])
  (:import (com.unboundid.ldap.listener InMemoryDirectoryServer InMemoryDirectoryServerConfig InMemoryListenerConfig)
           com.unboundid.ldap.sdk.schema.Schema
           com.unboundid.ldif.LDIFReader))


(def ^:dynamic *ldap-server*
  "An in-memory LDAP testing server."
  nil)

(defn- get-server-config []
  (doto (InMemoryDirectoryServerConfig. (into-array String ["dc=metabase,dc=com"]))
          (.addAdditionalBindCredentials "cn=Directory Manager" "password")
          (.setSchema (Schema/getDefaultStandardSchema))
          (.setListenerConfigs (into-array InMemoryListenerConfig [(InMemoryListenerConfig/createLDAPConfig "LDAP" 0)]))))

(defn- start-ldap-server! []
  (with-open [ldif (LDIFReader. (io/file (io/resource "ldap.ldif")))]
    (doto (InMemoryDirectoryServer. (get-server-config))
            (.importFromLDIF true ldif)
            (.startListening))))

(defn get-ldap-port
  "Get the port for the bound in-memory LDAP testing server."
  []
  (.getListenPort *ldap-server*))

(defn do-with-ldap-server
  "Bind `*ldap-server*` and the relevant settings to an in-memory LDAP testing server and executes `f`."
  [f]
  (binding [*ldap-server* (start-ldap-server!)]
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
  "Bind `*ldap-server*` and the relevant settings to an in-memory LDAP testing server and executes BODY."
  [& body]
  `(do-with-ldap-server (fn [] ~@body)))

(defmacro expect-with-ldap-server
  "Generate a unit test that runs ACTUAL with a bound `*ldap-server*` and relevant settings."
  [expected actual]
  `(expect ~expected (with-ldap-server ~actual)))
