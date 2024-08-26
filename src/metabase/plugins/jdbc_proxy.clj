(ns metabase.plugins.jdbc-proxy
  "JDBC proxy driver used for drivers added at runtime. DriverManager refuses to recognize drivers that weren't loaded
  by the system classloader, so we need to wrap our drivers loaded at runtime with a proxy class loaded at launch time."
  (:require
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [potemkin.types :as p.types]
   [pretty.core :refer [PrettyPrintable]])
  (:import
   (java.sql Driver DriverManager)))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Proxy Driver --------------------------------------------------

;; TODO -- why not use `java.sql.Wrapper` here instead of defining a new protocol that basically does the same thing?
;; issue: https://github.com/metabase/metabase/issues/39357
(p.types/defprotocol+ ^:private ProxyDriver
  (wrapped-driver [this]
    "Get the JDBC driver wrapped by a Metabase JDBC proxy driver."))

(defn- proxy-driver ^Driver [^Driver driver]
  (reify
    PrettyPrintable
    (pretty [_]
      (list 'proxy-driver driver))

    ProxyDriver
    (wrapped-driver [_]
      driver)

    Driver
    (acceptsURL [_ url]
      (.acceptsURL driver url))
    (connect [_ url info]
      (.connect driver url info))
    (getMajorVersion [_]
      (.getMajorVersion driver))
    (getMinorVersion [_]
      (.getMinorVersion driver))
    (getParentLogger [_]
      (.getParentLogger driver))
    (getPropertyInfo [_ url info]
      (.getPropertyInfo driver url info))
    (jdbcCompliant [_]
      (.jdbcCompliant driver))))

(defn create-and-register-proxy-driver!
  "Create a new JDBC proxy driver to wrap driver with `class-name`, but only if that class WAS NOT loaded by the System
  ClassLoader. Registers the driver with JDBC, and deregisters the class it wraps if that class is already
  registered.

  This is necessary because the DriverManager will not recognize any drivers that are *NOT* loaded by the System
  ClassLoader."
  [^String class-name]
  (let [klass (Class/forName class-name true (classloader/the-classloader))
        loaded-by-system-classloader? (identical? (.getClassLoader klass) (ClassLoader/getSystemClassLoader))]
    ;; if the System ClassLoader loaded this class, don't create the proxy driver, because that can break things in
    ;; some situations -- Oracle for example doesn't seem to behave properly when you do this. This mainly affects dev
    ;; which merges driver dependencies into the core project deps.
    (if loaded-by-system-classloader?
      (log/debug (u/format-color 'cyan
                                 "Not creating proxy JDBC driver for class %s -- original driver was loaded by system ClassLoader"
                                 class-name))
      (let [driver (proxy-driver (.newInstance klass))]
        (log/debug (u/format-color 'blue "Registering JDBC proxy driver for %s..." class-name))
        (DriverManager/registerDriver driver)

        ;; deregister the non-proxy version of the driver so it doesn't try to handle our URLs. Most JDBC drivers register
        ;; themseleves when the classes are loaded
        (doseq [driver (enumeration-seq (DriverManager/getDrivers))
                :when  (instance? klass driver)]
          (log/debug (u/format-color 'cyan "Deregistering original JDBC driver %s..." driver))
          (DriverManager/deregisterDriver driver))))))
