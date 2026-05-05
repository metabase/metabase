(ns metabase.starrez.storage
  "Azure Blob Storage integration for StarRez exports.

  Uses the Azure Blob Storage REST API directly with a container-level SAS URL.
  SAS URL format: https://{account}.blob.core.windows.net/{container}?{sas-token-params}

  Files are named: starrez_{Table}_{YYYY-MM-DD_HH-mm-ss}.csv"
  (:require
   [clojure.data.xml :as xml]
   [clojure.string :as str]
   [metabase.util.log :as log])
  (:import
   (java.io BufferedReader InputStreamReader)
   (java.net HttpURLConnection URI URL URLEncoder)))

(set! *warn-on-reflection* true)

(defn- parse-sas-params
  "Split a SAS query string into a map of {param-name param-value}, values RAW."
  [sas-token]
  (when (seq sas-token)
    (into {} (for [pair (str/split sas-token #"&")
                   :let [idx (.indexOf ^String pair "=")]
                   :when (not (neg? idx))]
               [(subs pair 0 idx) (subs pair (inc idx))]))))

(defn- encode-sas-value
  "URL-encode a SAS param value: `+`, `/`, `=` and other special chars become `%XX`."
  [^String v]
  (URLEncoder/encode v "UTF-8"))

(defn- build-query-string
  "Build a URL query string from a {param value} map, encoding each value safely."
  [params]
  (->> params
       (map (fn [[k v]] (str k "=" (encode-sas-value (str v)))))
       (str/join "&")))

(defn- parse-sas-url
  "Split a container SAS URL into a base container URL and a map of SAS query params.
  Uses getQuery (decoded form), so whether the user pastes the raw portal SAS
  (`sig=...+...=`) or one that's already URL-encoded (`sig=...%2B...%3D`), we get the
  same decoded values back. We then re-encode cleanly when building the request URL."
  [sas-url]
  (let [uri   (URI. sas-url)
        base  (str (.getScheme uri) "://" (.getHost uri) (.getPath uri))
        query (.getQuery uri)]
    {:container-url base
     :sas-params    (or (parse-sas-params query) {})}))

(defn- read-stream
  "Drain an input stream into a string (UTF-8). Returns nil if stream is nil."
  [is]
  (when is
    (with-open [rdr (BufferedReader. (InputStreamReader. is "UTF-8"))]
      (str/join "\n" (line-seq rdr)))))

(defn- raw-http-request
  "Low-level HTTP request using Java's HttpURLConnection.
  Sends the URL string verbatim — no re-encoding by an HTTP client.
  Returns {:status N :body string-or-nil}."
  [method ^String url-str
   {:keys [headers body]}]
  (let [conn (doto ^HttpURLConnection (.openConnection (URL. url-str))
               (.setRequestMethod method)
               (.setDoInput true))]
    (doseq [[k v] headers]
      (.setRequestProperty conn k v))
    (when body
      (.setDoOutput conn true)
      (with-open [out (.getOutputStream conn)]
        (.write out ^bytes body)))
    (let [status (.getResponseCode conn)
          stream (if (<= 200 status 299)
                   (.getInputStream conn)
                   (.getErrorStream conn))
          body   (read-stream stream)]
      {:status status :body body})))

(defn- blob-url
  "Full URL for a blob, with SAS query string appended (values URL-encoded)."
  [{:keys [container-url sas-params]} blob-name]
  (str container-url "/" blob-name "?" (build-query-string sas-params)))

(defn- list-url
  "Full URL for listing blobs in the container with prefix filter."
  [{:keys [container-url sas-params]} prefix]
  (let [params (cond-> (assoc sas-params "restype" "container" "comp" "list")
                 (seq prefix) (assoc "prefix" prefix))]
    (str container-url "?" (build-query-string params))))

(defn- tag-name=
  "Compare an XML element's tag against a string name.
  Handles both keyword tags (:Name) and clojure.data.xml 0.2.x QName objects."
  [element tag-str]
  (let [tag (:tag element)]
    (= tag-str (if (keyword? tag) (name tag) (str tag)))))

(defn- xml-child-text
  "Return the text content of the first child element whose tag name equals `tag-str`."
  [element tag-str]
  (some-> (filter #(tag-name= % tag-str) (:content element))
          first
          :content
          first))

(defn- parse-blob-element
  "Parse a single <Blob> XML element into a plain map."
  [blob-elem]
  (let [props (first (filter #(tag-name= % "Properties") (:content blob-elem)))]
    {:name          (xml-child-text blob-elem "Name")
     :last_modified (when props (xml-child-text props "Last-Modified"))
     :size          (when props (xml-child-text props "Content-Length"))}))

(defn list-exports
  "List all StarRez export blobs (prefix starrez_) in the Azure container.
  Returns a vector of {:name :last_modified :size} maps."
  [sas-url]
  (if (str/blank? sas-url)
    []
    (try
      (let [parsed (parse-sas-url sas-url)
            url    (list-url parsed "starrez_")
            resp   (raw-http-request "GET" url {})]
        (if (<= 200 (:status resp) 299)
          (let [root        (xml/parse-str (:body resp))
                blobs-node  (first (filter #(tag-name= % "Blobs") (xml-seq root)))
                blob-elems  (filter #(tag-name= % "Blob") (:content blobs-node))]
            (mapv parse-blob-element blob-elems))
          (do (log/warnf "Azure Blob list HTTP %s — body: %s" (:status resp)
                         (some-> ^String (:body resp) (subs 0 (min 400 (count (str (:body resp)))))))
              [])))
      (catch Exception e
        (log/errorf e "Failed to list StarRez exports from blob storage")
        []))))

(defn download-export
  "Download `blob-name` from Azure Blob Storage as a UTF-8 string.
  Returns nil on failure or when the SAS URL is not configured."
  [sas-url blob-name]
  (cond
    (str/blank? sas-url)   (do (log/warn "Cannot download: blob SAS URL is not configured") nil)
    (str/blank? blob-name) (do (log/warn "Cannot download: blob-name is empty") nil)
    :else
    (try
      (let [parsed (parse-sas-url sas-url)
            url    (blob-url parsed blob-name)
            resp   (raw-http-request "GET" url {})]
        (if (<= 200 (:status resp) 299)
          (:body resp)
          (do (log/warnf "Azure Blob download HTTP %s for %s" (:status resp) blob-name)
              nil)))
      (catch Exception e
        (log/errorf e "Failed to download %s from blob storage" blob-name)
        nil))))

(defn upload-export
  "Upload `content` (CSV string) as `blob-name` to Azure Blob Storage.
  Returns true on success."
  [sas-url blob-name ^String content]
  (cond
    (str/blank? sas-url) (do (log/warn "Cannot upload: blob SAS URL is not configured") false)
    (str/blank? content) (do (log/warnf "Cannot upload %s: empty content" blob-name) false)
    :else
    (try
      (let [parsed  (parse-sas-url sas-url)
            url     (blob-url parsed blob-name)
            payload (.getBytes content "UTF-8")
            resp    (raw-http-request
                     "PUT" url
                     {:headers {"x-ms-blob-type" "BlockBlob"
                                "Content-Type"   "text/csv; charset=utf-8"
                                "Content-Length" (str (alength payload))}
                      :body    payload})]
        (if (<= 200 (:status resp) 299)
          (do (log/infof "Uploaded %s to blob storage" blob-name) true)
          (do (log/warnf "Azure Blob upload HTTP %s for %s — body: %s"
                         (:status resp) blob-name
                         (some-> ^String (:body resp) (subs 0 (min 600 (count (str (:body resp)))))))
              false)))
      (catch Exception e
        (log/errorf e "Failed to upload %s to blob storage" blob-name)
        false))))

(defn delete-export
  "Delete a blob from Azure Blob Storage. Returns true on success."
  [sas-url blob-name]
  (if (or (str/blank? sas-url) (str/blank? blob-name))
    false
    (try
      (let [parsed (parse-sas-url sas-url)
            url    (blob-url parsed blob-name)
            resp   (raw-http-request "DELETE" url {})]
        (if (<= 200 (:status resp) 299)
          (do (log/infof "Deleted %s from blob storage" blob-name) true)
          (do (log/warnf "Azure Blob delete HTTP %s for %s" (:status resp) blob-name) false)))
      (catch Exception e
        (log/errorf e "Failed to delete %s from blob storage" blob-name)
        false))))

(defn cleanup-old-exports
  "Delete excess blobs for `table-name`, keeping only the `keep-n` most recent.
  Does nothing when `keep-n` is zero (keep all)."
  [sas-url table-name keep-n]
  (when (pos? keep-n)
    (let [prefix      (str "starrez_" table-name "_")
          all-exports (list-exports sas-url)
          table-blobs (->> all-exports
                           (filter #(some-> (:name %) (str/starts-with? prefix)))
                           (sort-by :name)   ; ISO timestamps are lexicographically ordered
                           reverse)
          to-delete   (drop keep-n table-blobs)]
      (doseq [{blob-name :name} to-delete]
        (when blob-name
          (log/infof "Deleting old export: %s" blob-name)
          (delete-export sas-url blob-name))))))
