(ns metabase.task.secure-delegate-test
  (:require
   [clojure.test :refer :all]
   [metabase.classloader.core :as classloader]
   [metabase.task.secure-delegate :as secure-delegate]
   [metabase.util.deserialization-allowlist :as dal])
  (:import
   (java.io ByteArrayInputStream ByteArrayOutputStream ObjectOutputStream)
   (java.sql Blob ResultSet)
   (org.quartz JobDataMap)))

(set! *warn-on-reflection* true)

(defn- serialize-bytes ^bytes [obj]
  (let [baos (ByteArrayOutputStream.)]
    (with-open [oos (ObjectOutputStream. baos)]
      (.writeObject oos obj))
    (.toByteArray baos)))

;;; A JobDataMap of the plain data a queue job carries, and a serializable class Metabase never stores
;;; (c3p0's connection-pool datasource) standing in for anything outside the EDN + Quartz value space.
(defn- job-data ^JobDataMap []
  (JobDataMap. {"database-id" (int 99)
                "payload"     {:foo 1 :bar #{:x :y} :nested {:a [1 2 3]}}
                "opts"        (doto (java.util.HashMap.) (.put "k" "v"))}))

(defn- unlisted-object [] (com.mchange.v2.c3p0.PoolBackedDataSource.))

;;; The delegates read a blob differently — StdJDBCDelegate via getBlob, PostgreSQLDelegate via getBytes
;;; — so we hand each a minimal ResultSet returning our bytes the way it expects, and call the real
;;; getObjectFromBlob override. No database needed: we're testing the delegate's read, not JDBC.

(defn- getblob-result-set ^ResultSet [^bytes bs]
  (reify ResultSet
    (^Blob getBlob [_ ^String _col]
      (reify Blob
        (length [_] (alength bs))
        (getBinaryStream [_] (ByteArrayInputStream. bs))))))

(defn- getbytes-result-set ^ResultSet [^bytes bs]
  (reify ResultSet
    (^bytes getBytes [_ ^String _col] bs)))

;; The gen-class delegate classes aren't AOT-compiled at this file's compile time (from source they're
;; compiled by install! at runtime), so we can't name them literally — a `require` doesn't make them
;; resolvable to the compiler either. We construct one by name and invoke its getObjectFromBlob override
;; reflectively, unwrapping the InvocationTargetException so the filter's own exception surfaces.
(defn- read-through-delegate! [db-type result-set-fn obj]
  (let [k        (Class/forName (secure-delegate/install! db-type) true (classloader/the-classloader))
        delegate (.newInstance k)
        m        (.getMethod k "getObjectFromBlob" (into-array Class [ResultSet String]))]
    (try
      (.invoke m delegate (object-array [(result-set-fn (serialize-bytes obj)) "data"]))
      (catch java.lang.reflect.InvocationTargetException e
        (throw (.getCause e))))))

(deftest getObjectFromBlob-reads-through-allow-list-test
  (testing "each secure delegate's getObjectFromBlob reads allowed job data and refuses an unlisted class"
    (doseq [[label db-type result-set-fn] [["StdJDBCDelegate (getBlob)"     :h2       getblob-result-set]
                                           ["PostgreSQLDelegate (getBytes)" :postgres getbytes-result-set]]]
      (testing label
        (testing "reconstructs a JobDataMap of allowed data"
          (is (= JobDataMap (class (read-through-delegate! db-type result-set-fn (job-data))))))
        (testing "refuses an unlisted class before constructing it"
          (is (thrown? java.io.InvalidClassException
                       (read-through-delegate! db-type result-set-fn (unlisted-object)))))))))

(deftest blob-allowed-prefixes-are-edn-plus-quartz-test
  (testing "the Quartz blob allow-set is the EDN value space plus Quartz's own wrapper classes"
    (is (= (conj dal/clojure-data-prefixes "org.quartz.")
           secure-delegate/blob-allowed-prefixes))))

(deftest getObjectFromBlob-override-canary-test
  (testing "each secure delegate declares its OWN getObjectFromBlob(ResultSet, String) — if a Quartz
            bump renames or re-signs that method our override silently stops overriding, and this fails"
    (doseq [class-name ["metabase.task.SecureStdDelegate" "metabase.task.SecurePostgresDelegate"]]
      (let [k (Class/forName class-name true (classloader/the-classloader))
            m (.getMethod k "getObjectFromBlob" (into-array Class [ResultSet String]))]
        (is (= k (.getDeclaringClass m))
            (str class-name " declares its own getObjectFromBlob override"))))))
