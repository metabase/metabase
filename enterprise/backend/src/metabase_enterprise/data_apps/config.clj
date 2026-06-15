(ns metabase-enterprise.data-apps.config
  "Parsing + validation of a per-app `data_app.yml`. Each data app lives in its
   own directory under `data_apps/` at the repo root, alongside its built bundle:

     data_apps/
       sales/
         data_app.yml
         dist/index.js

   where `data_app.yml` is:

     name: Sales dashboard      # display name
     slug: sales                # URL identity (/data-app/:slug)
     path: dist/index.js        # bundle path, relative to this app's directory"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.yaml :as yaml])
  (:import
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

(def config-file-name
  "Canonical name of the per-app config file (used in error messages). Both
   `data_app.yml` and `data_app.yaml` are accepted on disk — see [[config-file-re]]."
  "data_app.yml")

(def config-file-re
  "Matches the per-app config filename, either extension."
  #"data_app\.ya?ml")

(def apps-dir
  "Directory at the repo root that holds one subdirectory per data app."
  "data_apps")

(def ^:private slug-pattern
  "Lowercase letters/numbers separated by single dashes."
  #"[a-z0-9]+(?:-[a-z0-9]+)*")

(def ^:private reserved-slugs
  "Slugs that collide with literal `/api/data-app/*` sub-routes (see the API's
   `slug-regex`). An app with one of these would sync but be unreachable, so we
   reject it during parsing."
  #{"repo-status"})

(defn- normalize-path
  "Trim and drop a leading `./` so the path is relative to the app directory."
  [p]
  (-> (str p) str/trim (str/replace #"^\./" "")))

(defn- path-traversal? [path]
  (some #(= ".." %) (str/split path #"/")))

(defn- parse-yaml [^bytes bytes ^String dir]
  (try
    (with-open [r (io/reader (ByteArrayInputStream. bytes) :encoding "UTF-8")]
      (yaml/parse-stream r))
    (catch Exception e
      (throw (ex-info (tru "Could not parse {0}/{1}: {2}" dir config-file-name (ex-message e))
                      {:status-code 400})))))

(defn parse-app-config
  "Parse the bytes of one `data_app.yml` (from directory `dir`, used only for
   error messages) into `{:slug ..., :display_name ..., :path ...}`. `path` is
   relative to the app's directory. Throws an `ex-info` with `:status-code` 400
   on malformed or incomplete content."
  [^bytes bytes ^String dir]
  (let [parsed (parse-yaml bytes dir)
        slug   (some-> (:slug parsed) str str/trim not-empty)
        name   (some-> (:name parsed) str str/trim not-empty)
        path   (some-> (:path parsed) normalize-path not-empty)]
    (when-not (and slug (re-matches slug-pattern slug))
      (throw (ex-info (tru "{0}/{1}: \"slug\" must be lowercase letters, numbers, and dashes." dir config-file-name)
                      {:status-code 400})))
    (when (contains? reserved-slugs slug)
      (throw (ex-info (tru "{0}/{1}: \"{2}\" is a reserved slug." dir config-file-name slug)
                      {:status-code 400})))
    (when-not name
      (throw (ex-info (tru "{0}/{1}: \"name\" is required." dir config-file-name)
                      {:status-code 400})))
    (when-not path
      (throw (ex-info (tru "{0}/{1}: \"path\" is required." dir config-file-name)
                      {:status-code 400})))
    (when (path-traversal? path)
      (throw (ex-info (tru "{0}/{1}: \"path\" must not contain \"..\"." dir config-file-name)
                      {:status-code 400})))
    {:slug slug, :display_name name, :path path}))
