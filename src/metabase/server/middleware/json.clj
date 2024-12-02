(ns metabase.server.middleware.json
  "Middleware related to parsing JSON requests and generating JSON responses."
  (:require
   [clojure.java.io :as io]
   [metabase.util.date-2 :as u.date]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [ring.util.io :as rui]
   [ring.util.request :as req]
   [ring.util.response :as response])
  (:import
   (com.fasterxml.jackson.core JsonParseException)
   (java.io BufferedWriter OutputStream OutputStreamWriter)
   (java.nio.charset StandardCharsets)
   (java.time.temporal Temporal)))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           JSON SERIALIZATION CONFIG                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;; ## Custom JSON encoders

;; For java.time classes use the date util function that writes them as ISO-8601
(json/add-encoder Temporal (fn [t json-generator]
                             (json/write-string json-generator (u.date/format t))))

;; Always fall back to `.toString` instead of barfing. In some cases we should be able to improve upon this behavior;
;; `.toString` may just return the Class and address, e.g. `some.Class@72a8b25e`
;; The following are known few classes where `.toString` is the optimal behavior:
;; *  `org.postgresql.jdbc4.Jdbc4Array` (Postgres arrays)
;; *  `org.bson.types.ObjectId`         (Mongo BSON IDs)
;; *  `java.sql.Date`                   (SQL Dates -- .toString returns YYYY-MM-DD)
(json/add-encoder Object (fn [obj json-generator]
                           (json/write-string json-generator (str obj))))

;; Binary arrays ("[B") -- hex-encode their first four bytes, e.g. "0xC42360D7"
(json/add-encoder
 (Class/forName "[B")
 (fn [byte-ar json-generator]
   (json/write-string json-generator (apply str "0x" (for [b (take 4 byte-ar)]
                                                       (format "%02X" b))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Streaming JSON Responses                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- streamed-json-response
  "Write `response-seq` to a PipedOutputStream as JSON, returning the connected PipedInputStream"
  [response-seq opts]
  (rui/piped-input-stream
   (fn [^OutputStream output-stream]
     (with-open [output-writer   (OutputStreamWriter. output-stream StandardCharsets/UTF_8)
                 buffered-writer (BufferedWriter. output-writer)]
       (try
         (json/encode-to response-seq buffered-writer opts)
         (catch Throwable e
           (log/errorf "Error generating JSON response stream: %s" (ex-message e))
           (throw e)))))))

(defn- wrap-streamed-json-response* [opts response]
  (if-let [json-response (and (coll? (:body response))
                              (update response :body streamed-json-response opts))]
    (if (contains? (:headers json-response) "Content-Type")
      json-response
      (response/content-type json-response "application/json; charset=utf-8"))
    response))

(defn wrap-streamed-json-response
  "Similar to ring.middleware/wrap-json-response in that it will serialize the response's body to JSON if it's a
  collection. Rather than generating a string it will stream the response using a PipedOutputStream.

  Accepts the following options (same as `wrap-json-response`):

  :pretty            - true if the JSON should be pretty-printed
  :escape-non-ascii  - true if non-ASCII characters should be escaped with \\u"
  [handler & [{:as opts}]]
  (fn
    ([request]
     (wrap-streamed-json-response* opts (handler request)))
    ([request respond raise]
     (handler
      request
      (fn respond* [response]
        (respond (wrap-streamed-json-response* opts response)))
      raise))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                JSON Requests                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- parse-json-or-exc [{:keys [body headers] :as req}]
  (if (and body
           (some->> (get headers "content-type")
                    (re-find #"^application/(.+?\+)?json")))
    (let [encoding (or (req/character-encoding req) "UTF-8")
          rdr      (io/reader body :encoding encoding)]
      (try
        [true (assoc req :body (json/decode+kw rdr))]
        (catch JsonParseException e
          [false e])))
    [true req]))

(defn- json-exc->res [^JsonParseException e]
  (let [loc (.getLocation e)]
    {:status  400
     :headers {"Content-Type" "application/json"}
     :body    {:error (format "%s at %s:%s"
                              (.getOriginalMessage e)
                              (.getLineNr loc)
                              (.getColumnNr loc))}}))

(defn wrap-json-body
  "Parses JSON with keywords if it's valid, gives understandable error back otherwise.

  Original wrap-json-body just returns 'Malformed JSON in request body.'"
  [handler]
  (fn
    ([req]
     (let [[valid? req-or-exc] (parse-json-or-exc req)]
       (if valid?
         (handler req-or-exc)
         (json-exc->res req-or-exc))))
    ([req respond raise]
     (let [[valid? req-or-exc] (parse-json-or-exc req)]
       (if valid?
         (handler req-or-exc respond raise)
         (respond (json-exc->res req-or-exc)))))))
