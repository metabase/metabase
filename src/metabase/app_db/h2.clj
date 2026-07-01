(ns metabase.app-db.h2
  "Single home for the H2-specific values and adapters referenced from otherwise-H2-free app-db code.
  Carries no compile-time dependency on the H2 library — class names are resolved at runtime and the
  adapter bodies use the `java.sql` interfaces — so this namespace loads even when H2 is absent from
  the classpath (e.g. the cloud build, where `org.h2.*` is stripped). The CLOB/BLOB result-set
  adapters register themselves only when the H2 library is actually present."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str])
  (:import
   (java.io BufferedReader)))

(set! *warn-on-reflection* true)

(def statement-was-canceled-error-code
  "Value of `org.h2.api.ErrorCode/STATEMENT_WAS_CANCELED`, inlined so callers can recognize an H2
  query cancelation without the H2 library on the classpath."
  57014)

(def jdbc-sql-syntax-error-exception-classname
  "Class name of H2's syntax-error exception, matched by name so callers need not import the class."
  "org.h2.jdbc.JdbcSQLSyntaxErrorException")

(defn clob->str
  "Convert an H2 clob to a String."
  ^String [^java.sql.Clob clob]
  (when clob
    (letfn [(->str [^BufferedReader buffered-reader]
              (loop [acc []]
                (if-let [line (.readLine buffered-reader)]
                  (recur (conj acc line))
                  (str/join "\n" acc))))]
      (with-open [reader (.getCharacterStream clob)]
        (if (instance? BufferedReader reader)
          (->str reader)
          (with-open [buffered-reader (BufferedReader. reader)]
            (->str buffered-reader)))))))

;; Register H2 CLOB/BLOB result-set handling only when the H2 library is present. Class names are
;; resolved at runtime and the bodies use the java.sql interfaces, so there is no compile-time
;; reference to org.h2.* and this namespace loads without H2 on the classpath.
(when-let [clob-class (try (Class/forName "org.h2.jdbc.JdbcClob") (catch Throwable _ nil))]
  (extend clob-class
    jdbc/IResultSetReadColumn
    {:result-set-read-column (fn [clob _ _] (clob->str clob))}))

(when-let [blob-class (try (Class/forName "org.h2.jdbc.JdbcBlob") (catch Throwable _ nil))]
  (extend blob-class
    jdbc/IResultSetReadColumn
    {:result-set-read-column (fn [^java.sql.Blob blob _ _]
                               (.getBytes blob 0 (int (.length blob))))}))
