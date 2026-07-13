(ns metabase-enterprise.workspaces.client
  "HTTP client for calling a connected child Metabase instance from the parent.
   Authenticates with an API key created on the child, sent as the `x-api-key`
   header. All functions return `{:ok true}` or `{:ok false :message ...}` rather
   than throwing — callers decide how a failed child call maps to an HTTP status."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- api-url [base-url path]
  (str (str/replace base-url #"/+$" "") path))

(defn- response-message
  "Best human-readable error from a child-instance response: the JSON body's
   `:message`, a raw string body, or the HTTP status."
  [{:keys [status body]}]
  (or (when (string? body)
        (or (:message (u/ignore-exceptions (json/decode+kw body)))
            (not-empty (str/trim body))))
      (tru "Child instance responded with HTTP status {0}" (str status))))

(defn- request-failure [url e]
  (log/warnf e "Error calling child Metabase instance at %s" url)
  {:ok false :message (tru "Could not reach the instance: {0}" (ex-message e))})

(defn test-connection
  "Check that `url` points at a reachable Metabase instance and that `api-key`
   authenticates an admin there (pushing a config requires a superuser API key)."
  [{:keys [url api-key]}]
  (let [target (api-url url "/api/user/current")]
    (try
      (let [{:keys [status body] :as response}
            (http/get target {:headers            {"x-api-key" api-key}
                              :throw-exceptions   false
                              :socket-timeout     10000
                              :connection-timeout 10000})]
        (cond
          (and (= status 200)
               (:is_superuser (u/ignore-exceptions (json/decode+kw body))))
          {:ok true}

          (= status 200)
          {:ok false :message (tru "The API key does not belong to an admin user on the instance.")}

          (contains? #{401 403} status)
          {:ok false :message (tru "The instance rejected the API key.")}

          :else
          {:ok false :message (response-message response)}))
      (catch Exception e
        (request-failure target e)))))

(defn push-config!
  "Upload `config-yaml` to the child instance's unsafe-init endpoint, which wipes
   the child's content and re-initializes it from the config. Synchronous — the
   child only responds once the wipe and import have completed."
  [{:keys [url api-key]} ^String config-yaml]
  (let [target (api-url url "/api/ee/advanced-config/unsafe-init")]
    (try
      (let [{:keys [status] :as response}
            ;; the config part must be a byte-array body: string bodies carry no
            ;; filename, and the child's multipart endpoint only treats parts
            ;; with a filename as file uploads
            (http/post target {:headers            {"x-api-key" api-key}
                               :multipart          [{:name      "config"
                                                     :content   (.getBytes config-yaml "UTF-8")
                                                     :filename  "config.yml"
                                                     :mime-type "application/x-yaml"}]
                               :throw-exceptions   false
                               :socket-timeout     600000
                               :connection-timeout 10000})]
        (if (http/success? {:status status})
          {:ok true}
          {:ok false :message (response-message response)}))
      (catch Exception e
        (request-failure target e)))))
