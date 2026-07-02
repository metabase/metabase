(ns build.embedder-model
  "Build step for the embedder plugin: fetch pinned model files from HuggingFace, verify their sha256,
  and assemble per-model, per-arch zips into `modules/embedder/resources/metabase-embedder/` for bundling
  into the plugin jar.
  Bundle names follow `<model-name>-<arch>.zip` — `metabase-enterprise.embedder.model/model-source`
  resolves models by that convention, so adding an entry to `bundled-models` is all it takes to ship
  another model.

  Downloads are cached (and re-verified) under `modules/embedder/target/model-download/`, so repeated
  builds are offline once the cache is warm.
  Skip entirely with `SKIP_EMBEDDER_MODEL=true`."
  (:require
   [clojure.java.io :as io]
   [environ.core :as env]
   [metabuild-common.core :as u])
  (:import
   (java.io File)
   (java.security DigestInputStream MessageDigest)
   (java.util.zip ZipEntry ZipOutputStream)))

(set! *warn-on-reflection* true)

(def ^:private bundled-models
  "Model name → pinned HuggingFace source and file layout.
  `:revision` is a repo commit hash; bump deliberately, updating `:files`' sha256s alongside.
  `:arch->onnx-file` maps a bundle arch label (matched by
  `metabase-enterprise.embedder.model/bundled-model-arch`) to that ISA's INT8 export. Two buckets today:
  qint8 for arm64 hosts, quint8 for every x86 host — including AVX512, whose qint8 exports are
  byte-identical to the arm64 file, so revisit the bucketing only if avx512-specific INT8 wins a
  benchmark."
  {"all-MiniLM-L6-v2"
   {:hf-repo         "sentence-transformers/all-MiniLM-L6-v2"
    :revision        "1110a243fdf4706b3f48f1d95db1a4f5529b4d41"
    :arch->onnx-file {"arm64" "onnx/model_qint8_arm64.onnx"
                      "avx2"  "onnx/model_quint8_avx2.onnx"}
    :tokenizer-files ["tokenizer.json" "tokenizer_config.json" "special_tokens_map.json" "config.json"]
    :files           {"onnx/model_qint8_arm64.onnx" "4278337fd0ff3c68bfb6291042cad8ab363e1d9fbc43dcb499fe91c871902474"
                      "onnx/model_quint8_avx2.onnx" "b941bf19f1f1283680f449fa6a7336bb5600bdcd5f84d10ddc5cd72218a0fd21"
                      "tokenizer.json"              "be50c3628f2bf5bb5e3a7f17b1f74611b2561a3a27eeab05e5aa30f411572037"
                      "tokenizer_config.json"       "acb92769e8195aabd29b7b2137a9e6d6e25c476a4f15aa4355c233426c61576b"
                      "special_tokens_map.json"     "303df45a03609e4ead04bc3dc1536d0ab19b5358db685b6f3da123d05ec200e3"
                      "config.json"                 "953f9c0d463486b10a6871cc2fd59f223b2c70184f49815e7efbcab5d8908b41"}}})

(def ^:private download-dir
  (u/filename u/project-root-directory "modules" "embedder" "target" "model-download"))

(def ^:private bundle-dir
  (u/filename u/project-root-directory "modules" "embedder" "resources" "metabase-embedder"))

(defn- sha256 ^String [^File file]
  (let [digest (MessageDigest/getInstance "SHA-256")]
    (with-open [in (DigestInputStream. (io/input-stream file) digest)]
      (io/copy in (java.io.OutputStream/nullOutputStream)))
    (format "%064x" (BigInteger. 1 (.digest digest)))))

(defn- verify-sha256! [^File file expected]
  (let [actual (sha256 file)]
    (when-not (= expected actual)
      (throw (ex-info (format "sha256 mismatch for %s: expected %s, got %s" file expected actual)
                      {:file (str file) :expected expected :actual actual})))))

(defn- cached-file ^File [model-name repo-path]
  (io/file download-dir model-name (u/filename repo-path)))

(defn- download! [{:keys [hf-repo revision]} repo-path ^File dest]
  (let [url (format "https://huggingface.co/%s/resolve/%s/%s" hf-repo revision repo-path)]
    (u/announce "Downloading %s" url)
    (io/make-parents dest)
    (with-open [in (io/input-stream (io/as-url url))]
      (io/copy in dest))))

(defn- fetch-file!
  "Return the local file for `repo-path`, downloading it unless a hash-verified copy is cached."
  ^File [model-name {:keys [files] :as model-spec} repo-path]
  (let [file     (cached-file model-name repo-path)
        expected (get files repo-path)]
    (if (and (.exists file) (= expected (sha256 file)))
      (u/announce "Using cached %s" (str file))
      (do (download! model-spec repo-path file)
          (verify-sha256! file expected)))
    file))

(defn- write-zip!
  "Assemble a flat model zip (the layout DJL expects when extracting a model archive):
  the arch's INT8 weights as `model.onnx` plus the tokenizer/config files under their own names."
  [model-name {:keys [arch->onnx-file tokenizer-files] :as model-spec} arch ^File zip-file]
  (io/make-parents zip-file)
  (with-open [out (ZipOutputStream. (io/output-stream zip-file))]
    (doseq [[entry-name ^File file] (cons ["model.onnx" (fetch-file! model-name model-spec (arch->onnx-file arch))]
                                          (map (juxt identity (partial fetch-file! model-name model-spec))
                                               tokenizer-files))]
      (.putNextEntry out (ZipEntry. ^String entry-name))
      (io/copy file out)
      (.closeEntry out)))
  (u/announce "Wrote %s" (str zip-file)))

(defn fetch-model!
  "Fetch (or reuse cached) pinned model files and assemble per-model, per-arch bundle zips.
  Skip with SKIP_EMBEDDER_MODEL=true."
  [_]
  (if (= (env/env :skip-embedder-model) "true")
    (u/announce "Skipping embedder model fetch (SKIP_EMBEDDER_MODEL=true)")
    (u/step "Fetch embedder models and assemble bundles"
      (doseq [[model-name model-spec] bundled-models
              arch                    (keys (:arch->onnx-file model-spec))]
        (write-zip! model-name model-spec arch
                    (io/file bundle-dir (str model-name "-" arch ".zip")))))))
