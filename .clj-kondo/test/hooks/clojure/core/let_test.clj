(ns hooks.clojure.core.let-test
  (:require
   [clj-kondo.core :as kondo]
   [clojure.java.io :as io]
   [clojure.test :refer :all]))

(set! *warn-on-reflection* true)

(defn- findings!
  "`:metabase/validated-field-access` findings from a real kondo run over `source`, as `[row message]`."
  [source]
  (let [tmp-dir (.toFile (java.nio.file.Files/createTempDirectory
                          "validated-let" ^"[Ljava.nio.file.attribute.FileAttribute;"
                          (into-array java.nio.file.attribute.FileAttribute [])))
        file    (io/file tmp-dir "sink.clj")]
    (try
      (spit file source)
      (->> (:findings (kondo/run! {:lint [(str file)], :config-dir ".clj-kondo"}))
           (filter #(= :metabase/validated-field-access (:type %)))
           (mapv (juxt :row :message)))
      (finally
        (run! io/delete-file (reverse (file-seq tmp-dir)))))))

(def ^:private header
  "(ns sink (:require [metabase.util.validated :as validated]) (:import (rec EventUpdate)))\n")

(deftest ^:synchronized lint-let-test
  (testing "a hinted local read with .- is fine"
    (is (= [] (findings! (str header "
(let [^EventUpdate u (validated/validated EventUpdate x)]
  (.-event-id u))")))))
  (testing "an unrelated let is left alone"
    (is (= [] (findings! (str header "(let [{:keys [a]} (f x)] (:a x))")))))
  (testing "the binding must be a symbol hinted with the record's class"
    (is (= [[3 "Bind a validated record to a local hinted ^EventUpdate, and read its fields with .-"]
            [4 "Bind a validated record to a local hinted ^EventUpdate, and read its fields with .-"]
            [5 "Bind a validated record to a local hinted ^EventUpdate, and read its fields with .-"]]
           (findings! (str header "
(let [u (validated/validated EventUpdate x)
      ^Other v (validated/validated EventUpdate x)
      {:keys [event-id]} (validated/validated EventUpdate x)]
  [u v event-id])")))))
  (testing "a hinted local must not be read by keyword, get, get-in, select-keys, ->, or destructuring"
    (is (= (mapv #(vector % "Read a validated EventUpdate's fields with .-, not by keyword: a misspelled keyword is nil")
                 [4 5 6 7 8 9])
           (findings! (str header "
(let [^EventUpdate u (validated/validated EventUpdate x)]
  [(:event-idd u)
   (get u :changes)
   (get-in u [:changes :name])
   (select-keys u [:changes])
   (-> u :changes)
   (let [{:keys [changes]} u] changes)
   (.-event-id u)])"))))))

(deftest ^:synchronized lint-let-keeps-kondo-let-analysis-test
  (testing "the hook returns the let unchanged, so kondo still reports an unused binding"
    (let [tmp-dir (.toFile (java.nio.file.Files/createTempDirectory
                            "validated-let" ^"[Ljava.nio.file.attribute.FileAttribute;"
                            (into-array java.nio.file.attribute.FileAttribute [])))
          file    (io/file tmp-dir "unused.clj")]
      (try
        (spit file "(ns unused) (defn f [] (let [unused-local 1] 2))")
        (is (some #(= :unused-binding (:type %))
                  (:findings (kondo/run! {:lint [(str file)], :config-dir ".clj-kondo"}))))
        (finally
          (run! io/delete-file (reverse (file-seq tmp-dir))))))))
