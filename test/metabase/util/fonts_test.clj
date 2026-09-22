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

(deftest available-fonts-match-the-build-output-test
  (testing "the hard-coded family list has not drifted from what the build emits"
    (when-let [emitted (families-the-build-emitted)]
      (is (= emitted (set (u.fonts/available-fonts)))))))

(deftest hashed-font-url-path-test
  (if (u.fonts/bundled-fonts-available?)
    (do
      (testing "hashed files resolve to a web path"
        (is (re-matches #"/app/dist/fonts/Lato/lato-v16-latin-regular\.[a-f0-9]+\.woff2"
                        (u.fonts/hashed-font-url-path "Lato" "lato-v16-latin-regular" "woff2")))
        (is (re-matches #"/app/dist/fonts/PT_Serif/PTSerif-Bold\.[a-f0-9]+\.woff2"
                        (u.fonts/hashed-font-url-path "PT Serif" "PTSerif-Bold" "woff2"))))
      (testing "the chunk that carries no latin glyphs is never the one resolved"
        (is (not (str/includes? (u.fonts/hashed-font-url-path "Lato" "lato-v16-latin-regular" "woff2")
                                ".rest."))))
      (testing "a face the build does not split still resolves"
        (is (re-matches #"/app/dist/fonts/Lato/lato-v16-latin-regular\.[a-f0-9]+\.ttf"
                        (u.fonts/hashed-font-url-path "Lato" "lato-v16-latin-regular" "ttf"))))
      (testing "a face that does not exist resolves to nil rather than a broken URL"
        (is (nil? (u.fonts/hashed-font-url-path "Slabo 27px" "Slabo27px-Bold" "woff2")))))
    (testing "without a frontend build there is no file to point at"
      (is (nil? (u.fonts/hashed-font-url-path "Lato" "lato-v16-latin-regular" "woff2"))))))

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
                             (str jar-fonts-dir "/Lato/lato-v16-latin-regular.b2c3d4e5.rest.woff2")
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
      (with-redefs [u.fonts/emitted-filenames index]
        (let [results (lookups-in-parallel!
                       threads loader
                       #(u.fonts/find-hashed-file "Lato" "lato-v16-latin-regular" "woff2"))]
          (is (= (repeat threads jar-font-filename) results)
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
                                 "lato-v16-latin-regular.b2c3d4e5.rest.woff2"}
                    "PT_Serif" #{"PTSerif-Bold.c3d4e5f6.woff2"}}
                   (update-vals (#'u.fonts/read-emitted-filenames jar-fonts-dir) set)))
            (is (.isOpen shared)
                "closing a filesystem it did not open would break every other reader of that jar")
            (finally
              (.setContextClassLoader (Thread/currentThread) before))))))))
