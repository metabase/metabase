(ns metabase.test.integrations.ldap
  (:require [clojure.java.io :as io]
            [expectations :refer [expect]]
            [metabase.test.util :as tu])
  (:import (com.unboundid.ldap.listener InMemoryDirectoryServer InMemoryDirectoryServerConfig InMemoryListenerConfig))
  (:import (com.unboundid.ldap.sdk.schema Schema))
  (:import (com.unboundid.ldif LDIFReader)))


(def ^:dynamic *ldap-server*
  "An in-memory testing LDAP server."
  nil)

(def ^:dynamic *ldap-connection*
  "A connection to the in-memory LDAP server in `*ldap-server*`."
  nil)

(defn- get-server-config []
  (doto (new InMemoryDirectoryServerConfig (into-array String ["dc=example,dc=com"]))
          (.addAdditionalBindCredentials "cn=Directory Manager" "password")
          (.setSchema (Schema/getDefaultStandardSchema))
          (.setListenerConfigs (into-array InMemoryListenerConfig [(InMemoryListenerConfig/createLDAPConfig "LDAP" 0)]))))

(defn- start-ldap-server! []
  (with-open [ldif (new LDIFReader (io/file (io/resource "ldap.ldif")))]
    (doto (new InMemoryDirectoryServer (get-server-config))
            (.importFromLDIF true ldif)
            (.startListening))))

(defn get-ldap-port
  "Get the port for the bound in-memory LDAP testing server."
  []
  (.getListenPort *ldap-server*))

(defn get-ldap-base
  "Get the base DN for the bound in-memory LDAP testing server."
  []
  (.toNormalizedString (first (.getBaseDNs *ldap-server*))))

(defn do-with-ldap-server
  "Bind `*ldap-server*` and the relevant settings to an in-memory LDAP testing server and executes `f`."
  [f]
  (binding [*ldap-server* (start-ldap-server!)]
    (try
      (tu/with-temporary-setting-values [ldap-enabled  true
                                         ldap-host     "localhost"
                                         ldap-port     (str (get-ldap-port))
                                         ldap-bind-dn  "cn=Directory Manager"
                                         ldap-password "password"
                                         ldap-base     (get-ldap-base)]
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

(defn do-with-ldap-connection
  "Bind `*ldap-connection*` to a connection to an in-memory LDAP testing server and executes `f`."
  [f]
  (with-ldap-server
    (binding [*ldap-connection* (.getConnection *ldap-server*)]
      (try
        (f)
        (finally (.close *ldap-connection*))))))

(defmacro with-ldap-connection
  "Bind `*ldap-connection*` to a connection to an in-memory LDAP testing server and executes BODY."
  [& body]
  `(do-with-ldap-connection (fn [] ~@body)))

(defmacro expect-with-ldap-connection
  "Generate a unit test that runs ACTUAL with a bound `*ldap-server*` and `*ldap-connection*`."
  [expected actual]
  `(expect ~expected (with-ldap-connection ~actual)))
