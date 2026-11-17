(ns metabase.util.fonts-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.util.files :as u.files]
   [metabase.util.fonts :as u.fonts])
  (:import
   (java.net URI URL URLClassLoader)
   (java.nio.file FileSystems)
   (java.util Collections)
   (java.util.concurrent CyclicBarrier)
   (java.util.jar JarEntry JarOutputStream)))

(set! *warn-on-reflection* true)

(defn- families-the-build-emitted
  "Font family names taken from the directories the frontend build wrote, or nil when it has not run."
  []
  (when (u.fonts/bundled-fonts-available?)
    (u.files/with-open-path-to-resource [font-path "frontend_client/app/dist/fonts"]
      (let [prefix (str font-path "/")]
        (->> (u.files/files-seq font-path)
             (map #(str/replace (str %) prefix ""))
             (map #(str/replace % "_" " "))
             set)))))

(deftest available-fonts-test
  (testing "the whitelabel picker lists every bundled family, with or without a frontend build"
    (is (= 21 (count (u.fonts/available-fonts))))
    (is (u.fonts/available-font? "Lato"))
    (is (u.fonts/available-font? "PT Serif"))
    (is (u.fonts/available-font? "Slabo 27px")))
  (testing "An invalid font on the system returns `false`."
    (is (not (u.fonts/available-font? "Comic Sans")))))

(defn- families-in-the-source-tree
  "Font family names taken from the directories the fonts are committed in, or nil when run somewhere
  that has no checkout. Every CI job has these, so the drift check below runs even where the frontend
  was never built."
  []
  (let [dir (io/file "frontend/fonts")]
    (when (.isDirectory dir)
      (->> (.listFiles dir)
           (filter (fn [^java.io.File f] (.isDirectory f)))
           (map (fn [^java.io.File f] (str/replace (.getName f) "_" " ")))
           set))))

(deftest available-fonts-match-the-source-tree-test
  (testing "the hard-coded family list has not drifted from the directories the fonts live in"
    (let [families (families-in-the-source-tree)]
      (is (some? families)
          "frontend/fonts is in every checkout, so this check should never be skipped in CI")
      (is (= families (set (u.fonts/available-fonts)))))))

(deftest available-fonts-match-the-build-output-test
  (testing "the hard-coded family list has not drifted from what the build emits"
    (when-let [emitted (families-the-build-emitted)]
      (is (= emitted (set (u.fonts/available-fonts)))))))

(def ^:private ranges
  {"latin" "U+20-FF" "rest" "U+100-10FFFF"})

(defn- sources-among
  "What [[u.fonts/font-face-sources]] returns when the build emitted `filenames` for Roboto."
  [filenames stem]
  (with-redefs [u.fonts/emitted-filenames (delay {"Roboto" filenames})
                u.fonts/unicode-ranges    (delay ranges)]
    (u.fonts/font-face-sources "Roboto" stem "woff2")))

(deftest font-face-sources-test
  (testing "a split face returns every chunk, each with the range it covers"
    (is (= [{:path "/app/dist/fonts/Roboto/Roboto-Bold.a1b2c3d4.woff2"      :unicode-range "U+20-FF"}
            {:path "/app/dist/fonts/Roboto/Roboto-Bold.rest.e5f6a7b8.woff2" :unicode-range "U+100-10FFFF"}]
           (sources-among ["Roboto-Bold.rest.e5f6a7b8.woff2"
                           "Roboto-Bold.a1b2c3d4.woff2"
                           "Roboto-Regular.c3d4e5f6.woff2"
                           "Roboto-Bold.a1b2c3d4.woff"]
                          "Roboto-Bold"))))
  (testing "a face the build does not split has no range, so it claims every codepoint"
    (is (= [{:path "/app/dist/fonts/Roboto/Roboto-Bold.a1b2c3d4.woff2"}]
           (sources-among ["Roboto-Bold.a1b2c3d4.woff2"] "Roboto-Bold"))))
  (testing "a hash made only of letters is not read as a chunk name"
    (is (= [{:path "/app/dist/fonts/Roboto/Roboto-Bold.deadbeef.woff2"}]
           (sources-among ["Roboto-Bold.deadbeef.woff2"] "Roboto-Bold"))))
  (testing "a chunk the build published no range for throws rather than claim every codepoint"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"no unicode-range for font chunk \"cyrillic\""
                          (sources-among ["Roboto-Bold.a1b2c3d4.woff2"
                                          "Roboto-Bold.cyrillic.e5f6a7b8.woff2"]
                                         "Roboto-Bold"))))
  (testing "a face that does not exist has no sources rather than a broken URL"
    (is (= [] (sources-among ["Roboto-Bold.a1b2c3d4.woff2"] "Roboto-Black")))))

(deftest font-face-sources-match-the-build-output-test
  (testing "every woff2 the build emitted is a source of its face, and a split face has a range on each chunk"
    (when (u.fonts/bundled-fonts-available?)
      (doseq [[dirname filenames] @@#'u.fonts/emitted-filenames
              filename            filenames
              :when               (str/ends-with? filename ".woff2")]
        (testing (str dirname "/" filename)
          (let [[_ stem] (re-matches #"(.+?)(?:\.[a-z]+)?\.[a-f0-9]+\.woff2" filename)
                sources  (u.fonts/font-face-sources (str/replace dirname "_" " ") stem "woff2")]
            (is (some #(str/ends-with? (:path %) (str "/" filename)) sources))
            (is (or (= 1 (count sources))
                    (every? :unicode-range sources)))))))))

(deftest font-face-sources-without-a-build-test
  (when-not (u.fonts/bundled-fonts-available?)
    (testing "without a frontend build there is no file to point at"
      (is (= [] (u.fonts/font-face-sources "Lato" "lato-v16-latin-regular" "woff2"))))))

;;; ------------------------------------- Concurrency against a jar --------------------------------------

(def ^:private jar-fonts-dir "fonts-concurrency-test")

(def ^:private jar-font-filename "lato-v16-latin-regular.a1b2c3d4.woff2")

(defn- write-fonts-jar!
  "A jar holding the directory layout the frontend build emits, so the lookup runs against a jar
  filesystem rather than the real one. Returns its file."
  ^java.io.File []
  (let [jar (java.io.File/createTempFile "fonts-concurrency" ".jar")]
    (with-open [out (JarOutputStream. (io/output-stream jar))]
      (doseq [^String entry [(str jar-fonts-dir "/")
                             (str jar-fonts-dir "/Lato/")
                             (str jar-fonts-dir "/Lato/" jar-font-filename)
                             (str jar-fonts-dir "/Lato/lato-v16-latin-regular.rest.b2c3d4e5.woff2")
                             (str jar-fonts-dir "/PT_Serif/")
                             (str jar-fonts-dir "/PT_Serif/PTSerif-Bold.c3d4e5f6.woff2")]]
        (.putNextEntry out (JarEntry. entry))
        (.closeEntry out)))
    (.deleteOnExit jar)
    jar))

(defn- classloader-seeing
  "A classloader that finds the resources in `jar` on top of whatever this thread already sees."
  ^URLClassLoader [^java.io.File jar]
  (URLClassLoader. (into-array URL [(.toURL (.toURI jar))])
                   (.getContextClassLoader (Thread/currentThread))))

(defn- lookups-in-parallel!
  "Run `thread-count` threads that all call `f` at the same moment, each seeing `loader` as its
  context classloader. Returns what each one produced, a thrown exception included."
  [thread-count ^URLClassLoader loader f]
  (let [barrier (CyclicBarrier. thread-count)
        results (atom (vec (repeat thread-count nil)))
        threads (mapv (fn [i]
                        (Thread. ^Runnable
                         (fn []
                           (.setContextClassLoader (Thread/currentThread) loader)
                           (swap! results assoc i
                                  (try
                                    (.await barrier)
                                    (f)
                                    (catch Throwable e e))))))
                      (range thread-count))]
    (run! #(.start ^Thread %) threads)
    (run! #(.join ^Thread %) threads)
    @results))

(deftest concurrent-lookups-against-a-jar-test
  (testing "concurrent first lookups read the jar once and none of them fails"
    (let [loader  (classloader-seeing (write-fonts-jar!))
          reads   (atom 0)
          index   (delay
                    (swap! reads inc)
                    (#'u.fonts/read-emitted-filenames jar-fonts-dir))
          threads 8]
      (with-redefs [u.fonts/emitted-filenames index
                    u.fonts/unicode-ranges    (delay ranges)]
        (let [results (lookups-in-parallel!
                       threads loader
                       #(u.fonts/font-face-sources "Lato" "lato-v16-latin-regular" "woff2"))]
          (is (= (repeat threads [{:path          (str "/app/dist/fonts/Lato/" jar-font-filename)
                                   :unicode-range "U+20-FF"}
                                  {:path          "/app/dist/fonts/Lato/lato-v16-latin-regular.rest.b2c3d4e5.woff2"
                                   :unicode-range "U+100-10FFFF"}])
                 results)
              "a thread that saw a closed filesystem would have returned its exception here")
          (is (= 1 @reads)
              "the jar is listed once, however many lookups arrive together"))))))

(deftest lookup-owns-its-filesystem-test
  (testing "a reader of the same jar keeps its filesystem, because the lookup never shares one"
    (let [jar    (write-fonts-jar!)
          loader (classloader-seeing jar)
          ;; What with-open-path-to-resource would hand a caller: NIO's cached instance for this jar.
          shared-uri (URI. (str "jar:" (.toURI jar) "!/"))]
      (with-open [shared (FileSystems/newFileSystem shared-uri Collections/EMPTY_MAP)]
        (let [before (.getContextClassLoader (Thread/currentThread))]
          (try
            (.setContextClassLoader (Thread/currentThread) loader)
            ;; Sets: the order Files/list walks a jar is not guaranteed, and the lookup does not
            ;; depend on it.
            (is (= {"Lato"     #{jar-font-filename
                                 "lato-v16-latin-regular.rest.b2c3d4e5.woff2"}
                    "PT_Serif" #{"PTSerif-Bold.c3d4e5f6.woff2"}}
                   (update-vals (#'u.fonts/read-emitted-filenames jar-fonts-dir) set)))
            (is (.isOpen shared)
                "closing a filesystem it did not open would break every other reader of that jar")
            (finally
              (.setContextClassLoader (Thread/currentThread) before))))))))
