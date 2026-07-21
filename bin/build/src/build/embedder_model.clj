(ns build.embedder-model
  "Fetch, verify, and package the pinned Arctic model bundles used by the embedder plugin."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [environ.core :as env]
   [metabuild-common.core :as u])
  (:import
   (java.io File)
   (java.net URL)
   (java.nio.file FileVisitOption Files LinkOption Path)
   (java.security DigestInputStream MessageDigest)
   (java.util.zip ZipEntry ZipOutputStream)))

(set! *warn-on-reflection* true)

(def ^:private catalog-file
  (io/file u/project-root-directory "modules/embedder/resources/metabase/embedder-model-catalog.edn"))

(defn model-catalog
  "Read the immutable runtime/build catalog shared with the plugin."
  []
  (edn/read-string (slurp catalog-file)))

(def ^:private download-dir
  (io/file u/project-root-directory "modules/embedder/target/model-download"))

(def ^:private bundle-dir
  (io/file u/project-root-directory "modules/embedder/resources/metabase-embedder"))

(defn- sha256
  ^String [^File file]
  (let [digest (MessageDigest/getInstance "SHA-256")]
    (with-open [in (DigestInputStream. (io/input-stream file) digest)]
      (io/copy in (java.io.OutputStream/nullOutputStream)))
    (format "%064x" (BigInteger. 1 (.digest digest)))))

(defn- verify-sha256!
  [^File file expected]
  (let [actual (sha256 file)]
    (when-not (= expected actual)
      (throw (ex-info (format "sha256 mismatch for %s: expected %s, got %s" file expected actual)
                      {:file (str file) :expected expected :actual actual})))))

(defn- cached-file
  ^File [model-name repo-path]
  (io/file download-dir model-name (u/filename repo-path)))

(defn- download!
  [hf-repo revision repo-path ^File destination]
  (let [url (format "https://huggingface.co/%s/resolve/%s/%s" hf-repo revision repo-path)]
    (u/announce "Downloading %s" url)
    (io/make-parents destination)
    (let [connection (doto (.openConnection ^URL (io/as-url url))
                       (.setConnectTimeout 10000)
                       (.setReadTimeout 30000))]
      (with-open [in (.getInputStream connection)]
        (io/copy in destination)))))

(defn- fetch-file!
  ^File [model-name hf-repo revision repo-path expected-sha]
  (let [file (cached-file model-name repo-path)]
    (if (and (.exists file) (= expected-sha (sha256 file)))
      (u/announce "Using cached %s" (str file))
      (do
        (download! hf-repo revision repo-path file)
        (verify-sha256! file expected-sha)))
    file))

(defn- write-zip!
  [model-name {:keys [bundle-name model-revision architectures tokenizer-files]} arch ^File zip-file]
  (let [hf-repo      model-name
        weights      (get architectures arch)
        bundle-files (cons ["model.onnx"
                            (fetch-file! bundle-name hf-repo model-revision
                                         (:source weights) (:sha256 weights))]
                           (for [[repo-path expected-sha] tokenizer-files]
                             [repo-path
                              (fetch-file! bundle-name hf-repo model-revision repo-path expected-sha)]))]
    (io/make-parents zip-file)
    (with-open [out (ZipOutputStream. (io/output-stream zip-file))]
      (doseq [[entry-name ^File file] bundle-files]
        (.putNextEntry out (ZipEntry. ^String entry-name))
        (io/copy file out)
        (.closeEntry out)))
    (u/announce "Wrote %s" (str zip-file))))

(defn- clear-bundle-dir!
  []
  (let [root (.toPath ^File bundle-dir)]
    (when (Files/exists root (into-array LinkOption [LinkOption/NOFOLLOW_LINKS]))
      (with-open [paths (Files/walk root (make-array FileVisitOption 0))]
        (doseq [^Path path (sort-by #(.getNameCount ^Path %) > (iterator-seq (.iterator paths)))]
          (Files/delete path))))))

(defn fetch-model!
  "Build both architecture bundles. `SKIP_EMBEDDER_MODEL=true` produces no bundles."
  [_]
  (u/step "Fetch embedder model and assemble bundles"
    (clear-bundle-dir!)
    (when-not (= (env/env :skip-embedder-model) "true")
      (doseq [[model-name model-spec] (:models (model-catalog))
              arch                    (keys (:architectures model-spec))]
        (write-zip! model-name model-spec arch
                    (io/file bundle-dir (str (:bundle-name model-spec) "-" arch ".zip")))))))
