(ns metabase.task.secure-delegate-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.classloader.core :as classloader]
   [metabase.task.secure-delegate :as secure-delegate]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.deserialization-allowlist :as dal]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayOutputStream ObjectOutputStream)
   (java.sql ResultSet)
   (org.quartz JobDataMap)))

(set! *warn-on-reflection* true)

;; The DB round-trip test below reads a real QRTZ blob through the delegate, so the app DB must exist.
(use-fixtures :once (fixtures/initialize :db))

(defn- serialize-bytes ^bytes [obj]
  (let [baos (ByteArrayOutputStream.)]
    (with-open [oos (ObjectOutputStream. baos)]
      (.writeObject oos obj))
    (.toByteArray baos)))

(deftest blob-allow-set-permits-real-job-data-test
  (testing "the Quartz blob allow-set reads a JobDataMap of the plain data a job carries"
    ;; This is the whole point: Quartz's own wrapper (org.quartz.JobDataMap) plus EDN-shaped Clojure/JDK
    ;; data must survive the filter, or the scheduler breaks on read.
    (let [jdm (JobDataMap. {"database-id" (int 42)
                            "payload"     {:foo 1 :bar #{:x :y} :nested {:a [1 2 3]}}
                            "opts"        (java.util.HashMap. {"k" "v"})})]
      (is (= JobDataMap
             (class (dal/read-object-bytes (serialize-bytes jdm) secure-delegate/blob-allowed-prefixes)))))))

(deftest blob-allow-set-rejects-unlisted-class-test
  (testing "the Quartz blob allow-set treats a class outside the expected set as unreadable"
    ;; c3p0's PoolBackedDataSource is a serializable class on the classpath (it's the connection pool)
    ;; that Metabase never stores in job data — it stands in for anything outside the EDN + Quartz set.
    (let [unlisted-bytes (serialize-bytes (com.mchange.v2.c3p0.PoolBackedDataSource.))]
      (is (thrown-with-msg? java.io.InvalidClassException #"(?i)filter"
                            (dal/read-object-bytes unlisted-bytes secure-delegate/blob-allowed-prefixes))))))

(deftest secure-delegate-overrides-getObjectFromBlob-canary-test
  (testing "each secure delegate declares its OWN getObjectFromBlob(ResultSet, String) — if a Quartz
            bump renames or re-signs that method, our override silently stops overriding and this fails"
    (doseq [db-type [:h2 :mysql :postgres]]
      (let [class-name (secure-delegate/install! db-type)
            k          (Class/forName class-name true (classloader/the-classloader))
            m          (.getMethod k "getObjectFromBlob" (into-array Class [ResultSet String]))]
        (is (= k (.getDeclaringClass m))
            (str db-type " secure delegate declares its own getObjectFromBlob override"))))))

;;; End-to-end against the real app DB: an actual secure-delegate instance reads a real BLOB column the
;;; way Quartz does. This is the path that broke in the original investigation (job data unreadable), so
;;; we exercise the whole getBlob -> filtered ObjectInputStream -> readObject chain over JDBC, not just
;;; the in-memory filter.

(defn- h2-secure-delegate! ^org.quartz.impl.jdbcjobstore.StdJDBCDelegate []
  (-> (Class/forName (secure-delegate/install! :h2) true (classloader/the-classloader))
      (.getDeclaredConstructor (make-array Class 0))
      (.newInstance (object-array 0))))

(defn- read-blob-through-delegate!
  "Write `obj` (serialized) into a fresh BLOB column and read it back the way Quartz does — through a
  real secure-delegate instance's `getObjectFromBlob` against a live JDBC `ResultSet`. Returns whatever
  the delegate reconstructs (or throws from the filter). Exercises the full getBlob→filter→readObject
  chain, the seam the original job-data-unreadable failure lived in."
  [obj]
  (let [tbl (str "secure_delegate_test_" (str/replace (str (random-uuid)) "-" "_"))]
    (try
      (t2/query (str "CREATE TABLE " tbl " (id int, data blob)"))
      (t2/query {:insert-into (keyword tbl) :values [{:id 1 :data (serialize-bytes obj)}]})
      (t2/with-connection [conn]
        (with-open [ps (.prepareStatement conn (str "SELECT data FROM " tbl " WHERE id = 1"))
                    rs (.executeQuery ps)]
          (is (.next rs))
          (.getObjectFromBlob (h2-secure-delegate!) rs "data")))
      (finally
        (t2/query (str "DROP TABLE IF EXISTS " tbl))))))

(deftest getObjectFromBlob-reads-real-blob-over-jdbc-test
  (testing "a secure-delegate instance reconstructs a serialized JobDataMap out of a real BLOB column"
    (let [jdm (JobDataMap. {"database-id" (int 99) "payload" {:a 1 :b #{:x :y}}})]
      (is (= JobDataMap (class (read-blob-through-delegate! jdm)))))))

(defn- root-cause ^Throwable [^Throwable t]
  (if-let [c (.getCause t)] (recur c) t))

(deftest getObjectFromBlob-refuses-unlisted-blob-over-jdbc-test
  (testing "a secure-delegate instance treats an unlisted class serialized into a real BLOB column as
            unreadable, on the real JDBC read path"
    ;; The read runs inside a toucan2 connection block, which wraps the filter's InvalidClassException
    ;; in an ExceptionInfo — so we assert on the root cause rather than the (wrapped) outer type.
    (let [thrown (is (thrown? Throwable
                              (read-blob-through-delegate! (com.mchange.v2.c3p0.PoolBackedDataSource.))))
          cause  (root-cause thrown)]
      (is (instance? java.io.InvalidClassException cause)
          "the underlying failure is the deserialization filter refusing the class")
      (is (re-find #"(?i)filter" (str (ex-message cause)))))))
