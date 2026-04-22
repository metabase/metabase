(ns metabase.documents.collab.ydoc-convergence-test
  "Sanity check that the y-crdt-jni CRDT primitives converge correctly when
   two in-process YDoc instances cross-apply updates. This is NOT a test of
   the yhocuspocus server — it only proves the underlying Y-CRDT machinery
   we're relying on. Server-mediated convergence is verified manually via
   two-browser testing (see roadmap AC2)."
  (:require
   [clojure.test :refer :all])
  (:import
   (net.carcdr.ycrdt YBinding YBindingFactory YDoc YText)))

(set! *warn-on-reflection* true)

(defn- with-new-doc! [f]
  (let [^YBinding binding (YBindingFactory/auto)
        ^YDoc doc         (.createDoc binding)]
    (try
      (f doc)
      (finally (.close doc)))))

(deftest ^:parallel crdt-round-trip-test
  (testing "bytes produced by encodeStateAsUpdate hydrate into a fresh YDoc"
    (with-new-doc!
      (fn [^YDoc a]
        (let [^YText ta (.getText a "content")]
          (.insert ta 0 "hello"))
        (let [snapshot (.encodeStateAsUpdate a)]
          (with-new-doc!
            (fn [^YDoc b]
              (.applyUpdate b snapshot)
              (is (= "hello" (.toString (.getText b "content")))))))))))

(deftest ^:parallel crdt-two-way-convergence-test
  (testing "two YDocs making independent edits converge when updates are exchanged"
    (with-new-doc!
      (fn [^YDoc a]
        (with-new-doc!
          (fn [^YDoc b]
            (let [^YText ta (.getText a "content")
                  ^YText tb (.getText b "content")]
              (.insert ta 0 "AAA")
              (.insert tb 0 "BBB"))
            (.applyUpdate b (.encodeStateAsUpdate a))
            (.applyUpdate a (.encodeStateAsUpdate b))
            ;; Post-convergence, both docs render the same merged string.
            (let [final-a (.toString (.getText a "content"))
                  final-b (.toString (.getText b "content"))]
              (is (= final-a final-b))
              (is (= 6 (count final-a)))
              (is (contains? #{"AAABBB" "BBBAAA"} final-a)))))))))
