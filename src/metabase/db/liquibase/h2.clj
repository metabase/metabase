(ns metabase.db.liquibase.h2
  "Custom implementation of the Liquibase H2 adapter that uppercases all identifiers. See #20611 for more details."
  (:require [clojure.string :as str]
            [metabase.plugins.classloader :as classloader]
            [metabase.util :as u])
  (:import liquibase.database.core.H2Database
           liquibase.database.jvm.JdbcConnection))

(defn- upcase ^String [s]
  (some-> s u/upper-case-en))

(defn- h2-database* ^H2Database []
  (proxy [H2Database] []
    (quoteObject [object-name object-type]
      (let [^H2Database this this]
        (proxy-super quoteObject (upcase object-name) object-type)))

    (mustQuoteObjectName [_object-name _object-type]
      true)))

;; HACK! Create a [[java.lang.Package]] for the proxy class if one does not already exist. This is needed because:
;;
;; 1. Liquibase will throw an NPE if the package for the class does not exist -- see
;;    https://github.com/liquibase/liquibase/blob/master/liquibase-core/src/main/java/liquibase/logging/core/JavaLogService.java#L45
;;
;; 2. In Java 9+, the JVM will automatically define a package when a class is created; in Java 8, it does not.
;;
;; 3. The Clojure DynamicClassLoader does not create a Package -- see
;;    https://clojure.atlassian.net/browse/CLJ-1550?focusedCommentId=13025
(defn- define-package! [^String package-name]
  (doto (.getDeclaredMethod
         ClassLoader
         "definePackage"
         (into-array Class [String String String String String String String java.net.URL]))
    (.setAccessible true)
    (.invoke (classloader/the-classloader) (into-array Object [package-name nil nil nil nil nil nil nil]))
    (.setAccessible false)))

(let [klass (class (h2-database*))]
  (when-not (.getPackage klass)
    ;; class name will be something like           metabase.db.liquibase.h2.proxy$liquibase.database.core.H2Database$ff19274a
    ;; so the corresponding package name should be metabase.db.liquibase.h2.proxy$liquibase.database.core.H2Database
    (let [package-name (->> (str/split (.getName (class (h2-database*))) #"\$")
                            butlast
                            (str/join \$))]
      (define-package! package-name))))

(defn h2-database
  "A version of the Liquibase H2 implementation that always converts identifiers to uppercase and then quotes them."
  ^H2Database [^JdbcConnection conn]
  (doto (h2-database*)
    (.setConnection conn)))
