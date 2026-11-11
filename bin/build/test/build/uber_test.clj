(ns build.uber-test
  (:require
   [build.uber :as uber]
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [clojure.tools.build.api :as b])
  (:import
   (java.io File)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)
   (java.util.jar JarFile JarInputStream Manifest)
   (java.util.zip ZipEntry ZipOutputStream)))

(set! *warn-on-reflection* true)

(defn- temp-dir ^File []
  (.toFile (Files/createTempDirectory "uber-test" (make-array FileAttribute 0))))

(defn- write-jar!
  "Write a JAR of `entries`, `[path content]` or `[path content :stored]`. A path ending in `/` is a directory."
  [^File file entries]
  (with-open [zos (ZipOutputStream. (io/output-stream file))]
    (doseq [[^String path ^String content stored?] entries
            :let [data  (.getBytes (str content) "UTF-8")
                  entry (ZipEntry. path)]]
      (when stored?
        (let [crc (java.util.zip.CRC32.)]
          (.update crc data)
          (doto entry
            (.setMethod ZipEntry/STORED)
            (.setSize (alength data))
            (.setCompressedSize (alength data))
            (.setCrc (.getValue crc)))))
      (.putNextEntry zos entry)
      (when-not (.endsWith path "/")
        (.write zos data))
      (.closeEntry zos)))
  file)

(defn- jar-contents
  "path → content of every entry but the manifest, plus the set of directory entries."
  [^File file]
  (with-open [jar (JarFile. file)]
    (let [entries (enumeration-seq (.entries jar))]
      {:files (into {}
                    (for [^java.util.jar.JarEntry e entries
                          :when (not (.isDirectory e))
                          :when (not= "META-INF/MANIFEST.MF" (.getName e))]
                      [(.getName e) (slurp (.getInputStream jar e))]))
       :dirs  (into #{} (for [^java.util.jar.JarEntry e entries
                              :when (.isDirectory e)]
                          (.getName e)))})))

(defn- prefer-lib [preferred]
  (fn [{:keys [lib path in]}]
    (when (= lib preferred)
      {:write {path {:stream in}}})))

(defn- fixture! []
  (let [dir       (temp-dir)
        class-dir (doto (io/file dir "classes") .mkdirs)
        jar       (fn [lib entries] [lib {:paths [(str (write-jar! (io/file dir (str (name lib) ".jar")) entries))]}])]
    (spit (doto (io/file class-dir "app" "core.class") io/make-parents) "app")
    (spit (io/file class-dir "data_readers.clj") "{app/x app/read-x}")
    (spit (io/file class-dir "shared.txt") "from the class dir")
    {:dir       dir
     :class-dir (str class-dir)
     :basis     {:libs (into {}
                             [(jar 'a/a [["dup/Same.class" "from a"]
                                         ["META-INF/services/svc" "impl-a"]
                                         ["META-INF/LICENSE" "MIT"]
                                         ["data_readers.clj" "{a/y a/read-y}"]
                                         ["module-info.class" "excluded by b/uber"]
                                         ["skip/me.txt" "excluded by us"]
                                         ["shared.txt" "from a"]
                                         ["pinned/P.class" "pinned from a"]
                                         ["big/stored.bin" "stored in its JAR" :stored]
                                         ["empty-dir/" ""]])
                              (jar 'b/b [["dup/Same.class" "from b"]
                                         ["META-INF/services/svc" "impl-b"]
                                         ["META-INF/LICENSE" "mit"]
                                         ["META-INF/NOTICE" "notice"]
                                         ["pinned/P.class" "pinned from b"]
                                         ["/leading/slash.txt" "chopped"]])
                              (jar 'c/c [["dup/Same.class" "from c"]
                                         ["META-INF/services/svc" "impl-c"]
                                         ["pinned/P.class" "pinned from c"]])])}
     :params    {:conflict-handlers {"^pinned/.*" (prefer-lib 'b/b)}
                 :exclude           ["^skip/.*"]}}))

(deftest same-output-as-tools-build-test
  (testing "the uberjar has the same entries, with the same content, as the one `b/uber` builds"
    (let [{:keys [dir class-dir basis params]} (fixture!)
          expected (io/file dir "expected.jar")
          actual   (io/file dir "actual.jar")]
      (b/uber (merge params {:basis basis, :class-dir class-dir, :uber-file (str expected)}))
      (uber/uber (merge params {:basis     basis
                                :class-dir class-dir
                                :uber-file (str actual)
                                :manifest  (doto (Manifest.)
                                             (-> .getMainAttributes (.putValue "Manifest-Version" "1.0")))}))
      (let [expected-contents (jar-contents expected)
            actual-contents   (jar-contents actual)]
        (is (= expected-contents actual-contents))
        (testing "the fixture exercises what it is meant to"
          (is (= {"pinned/P.class"        "pinned from b"
                  "big/stored.bin"        "stored in its JAR"
                  "leading/slash.txt"     "chopped"
                  "META-INF/services/svc" "impl-a\nimpl-b\nimpl-c"}
                 (select-keys (:files actual-contents)
                              ["pinned/P.class" "big/stored.bin" "leading/slash.txt" "META-INF/services/svc"])))
          (is (not (contains? (:files actual-contents) "module-info.class")))
          (is (not (contains? (:files actual-contents) "skip/me.txt"))))))))

(deftest every-entry-is-compressed-test
  (testing "an entry stored uncompressed in its JAR is compressed, as `b/uber` does"
    (let [{:keys [dir class-dir basis params]} (fixture!)
          actual (io/file dir "actual.jar")]
      (uber/uber (merge params {:basis basis, :class-dir class-dir, :uber-file (str actual), :manifest (Manifest.)}))
      (with-open [jar (JarFile. actual)]
        (is (= #{ZipEntry/DEFLATED}
               (into #{} (map #(.getMethod ^ZipEntry %)) (enumeration-seq (.entries jar)))))))))

(deftest manifest-test
  (testing "the manifest is written as given, first, where `JarInputStream` finds it"
    (let [{:keys [dir class-dir basis params]} (fixture!)
          actual   (io/file dir "actual.jar")
          manifest (doto (Manifest.)
                     (-> .getMainAttributes (doto
                                             (.putValue "Manifest-Version" "1.0")
                                              (.putValue "Main-Class" "app.core"))))]
      (uber/uber (merge params {:basis basis, :class-dir class-dir, :uber-file (str actual), :manifest manifest}))
      (with-open [jis (JarInputStream. (io/input-stream actual))]
        (is (= "app.core" (-> jis .getManifest .getMainAttributes (.getValue "Main-Class"))))))))

(deftest extra-files-test
  (let [{:keys [dir class-dir basis params]} (fixture!)
        actual (io/file dir "actual.jar")
        extra  (doto (io/file dir "extra.clj") (spit "(ns extra)"))
        build! (fn [extra-files]
                 (uber/uber (merge params {:basis       basis
                                           :class-dir   class-dir
                                           :uber-file   (str actual)
                                           :manifest    (Manifest.)
                                           :extra-files extra-files})))]
    (testing "extra files are added, with their directories"
      (build! [["metabase/driver/extra.clj" extra]])
      (let [{:keys [files dirs]} (jar-contents actual)]
        (is (= "(ns extra)" (get files "metabase/driver/extra.clj")))
        (is (contains? dirs "metabase/driver/"))))
    (testing "an extra file may not replace anything"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"already in the uberjar"
                            (build! [["dup/Same.class" extra]]))))))

(deftest parent-is-a-file-test
  (testing "a path under a file another lib wrote fails, as it does in `b/uber`"
    (let [dir   (temp-dir)
          a     (write-jar! (io/file dir "a.jar") [["x" "a file"]])
          b-jar (write-jar! (io/file dir "b.jar") [["x/y" "under it"]])
          ;; a small map keeps its order, so `a` is visited first
          basis {:libs (array-map 'a/a {:paths [(str a)]}, 'b/b {:paths [(str b-jar)]})}]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"parent dir is a file"
                            (uber/uber {:basis     basis
                                        :class-dir (str (doto (io/file dir "classes") .mkdirs))
                                        :uber-file (str (io/file dir "out.jar"))
                                        :manifest  (Manifest.)}))))))
