(ns metabase.util.deserialization-allowlist-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.deserialization-allowlist :as dal])
  (:import
   (java.io ByteArrayInputStream ByteArrayOutputStream ObjectInputFilter ObjectInputFilter$Status
            ObjectInputStream ObjectOutputStream)))

(set! *warn-on-reflection* true)

(defn- serialize-bytes ^bytes [obj]
  (let [baos (ByteArrayOutputStream.)]
    (with-open [oos (ObjectOutputStream. baos)]
      (.writeObject oos obj))
    (.toByteArray baos)))

(defn- read-through [filter ^bytes bytes]
  (with-open [ois (doto (ObjectInputStream. (ByteArrayInputStream. bytes))
                    (.setObjectInputFilter filter))]
    (.readObject ois)))

(defn- decision-for-class
  "The filter's own decision for `klass` alone — asked directly, independent of any ambient/process-wide
  filter, so these tests are robust in a JVM that already has a serial filter installed."
  [^ObjectInputFilter filter ^Class klass]
  (.checkInput filter (reify java.io.ObjectInputFilter$FilterInfo
                        (serialClass [_] klass)
                        (arrayLength [_] -1)
                        (depth [_] 1)
                        (references [_] 0)
                        (streamBytes [_] 0))))

(deftest clojure-data-round-trips-test
  (testing "the Clojure-data allow-list permits the EDN value space and nothing else"
    (let [f (dal/allow-list-filter dal/clojure-data-prefixes)]
      (is (= {:foo 1 :bar #{:x :y} :nested {:a [1 2 3]} :s "hi" :n 4.5M}
             (read-through f (serialize-bytes {:foo 1 :bar #{:x :y} :nested {:a [1 2 3]} :s "hi" :n 4.5M})))
          "keywords, maps, sets, vectors, strings, and numbers all round-trip")
      (is (= "bare-string" (read-through f (serialize-bytes "bare-string")))))))

(deftest extra-prefixes-compose-test
  (testing "a caller splashes its own allowed prefixes on top of the Clojure-data base"
    (let [data-only (dal/allow-list-filter dal/clojure-data-prefixes)
          with-awt  (dal/allow-list-filter (conj dal/clojure-data-prefixes "java.awt."))
          pt-bytes  (serialize-bytes (java.awt.Point. 1 2))]
      (is (thrown? java.io.InvalidClassException (read-through data-only pt-bytes))
          "java.awt.Point is not in the base vocabulary")
      (is (= (java.awt.Point. 1 2) (read-through with-awt pt-bytes))
          "adding the java.awt. prefix admits it — without touching the base"))))

(deftest rejects-unlisted-class-test
  (testing "the filter allows a listed data class and refuses an unlisted one, decided per-class"
    ;; Ask the filter directly (via checkInput) rather than round-tripping through a stream, so the
    ;; assertions hold even in a JVM that already has a process-wide serial filter installed. c3p0's
    ;; PoolBackedDataSource is a serializable class on the classpath that stands in for "anything not in
    ;; the EDN value space".
    (let [f (dal/allow-list-filter dal/clojure-data-prefixes)]
      (is (= ObjectInputFilter$Status/ALLOWED
             (decision-for-class f clojure.lang.PersistentHashMap))
          "a Clojure data class is allowed")
      (is (= ObjectInputFilter$Status/REJECTED
             (decision-for-class f com.mchange.v2.c3p0.PoolBackedDataSource))
          "an unlisted class is rejected")))
  (testing "and end-to-end, an unlisted class throws from the filter during readObject"
    (let [f              (dal/allow-list-filter dal/clojure-data-prefixes)
          unlisted-bytes (serialize-bytes (com.mchange.v2.c3p0.PoolBackedDataSource.))]
      (is (thrown-with-msg? java.io.InvalidClassException #"(?i)filter"
                            (read-through f unlisted-bytes))))))
