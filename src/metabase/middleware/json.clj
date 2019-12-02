(ns metabase.middleware.json
  "Middleware related to parsing JSON requests and generating JSON responses."
  (:require [cheshire
             [core :as json]
             [generate :as json.generate]]
            [metabase.util :as u]
            [metabase.util.date-2 :as u.date]
            [ring.middleware.json :as ring.json]
            [ring.util
             [io :as rui]
             [response :as rr]])
  (:import com.fasterxml.jackson.core.JsonGenerator
           [java.io BufferedWriter OutputStream OutputStreamWriter]
           [java.nio.charset Charset StandardCharsets]
           java.time.temporal.Temporal))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           JSON SERIALIZATION CONFIG                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Tell the JSON middleware to use a date format that includes milliseconds (why?)
(def ^:private default-date-format "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")

(intern 'cheshire.factory 'default-date-format default-date-format)
(intern 'cheshire.generate '*date-format* default-date-format)

;; ## Custom JSON encoders

(defn- write-string! [^JsonGenerator json-generator, ^String s]
  (.writeString json-generator s))

;; For java.time classes use the date util function that writes them as ISO-8601
(json.generate/add-encoder Temporal (fn [t json-generator]
                                      (write-string! json-generator (u.date/format t))))

;; Always fall back to `.toString` instead of barfing. In some cases we should be able to improve upon this behavior;
;; `.toString` may just return the Class and address, e.g. `some.Class@72a8b25e`
;; The following are known few classes where `.toString` is the optimal behavior:
;; *  `org.postgresql.jdbc4.Jdbc4Array` (Postgres arrays)
;; *  `org.bson.types.ObjectId`         (Mongo BSON IDs)
;; *  `java.sql.Date`                   (SQL Dates -- .toString returns YYYY-MM-DD)
(json.generate/add-encoder Object json.generate/encode-str)

(defn- ^:deprecated encode-jdbc-clob [clob json-generator]
  (write-string! json-generator (u/jdbc-clob->str clob)))

;; TODO - we should add logic to convert CLOBs to strings when they come out of the database instead of doing it at
;; JSON serialization time. Once that's done we can remove this stuff
(json.generate/add-encoder org.h2.jdbc.JdbcClob         encode-jdbc-clob) ; H2
(json.generate/add-encoder org.postgresql.util.PGobject encode-jdbc-clob) ; Postgres

;; Binary arrays ("[B") -- hex-encode their first four bytes, e.g. "0xC42360D7"
(json.generate/add-encoder
 (Class/forName "[B")
 (fn [byte-ar json-generator]
   (write-string! json-generator (apply str "0x" (for [b (take 4 byte-ar)]
                                                   (format "%02X" b))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Parsing JSON Requests                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn wrap-json-body
  "Middleware that parses JSON in the body of a request. (This is basically a copy of `ring-json-middleware`, but
  tweaked to handle async-style calls.)"
  ;; TODO - we should really just fork ring-json-middleware and put these changes in the fork, or submit this as a PR
  [handler]
  (fn
    [request respond raise]
    (if-let [[valid? json] (#'ring.json/read-json request {:keywords? true})]
      (if valid?
        (handler (assoc request :body json) respond raise)
        (respond ring.json/default-malformed-response))
      (handler request respond raise))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Streaming JSON Responses                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- streamed-json-response
  "Write `RESPONSE-SEQ` to a PipedOutputStream as JSON, returning the connected PipedInputStream"
  [response-seq opts]
  (rui/piped-input-stream
   (fn [^OutputStream output-stream]
     (with-open [output-writer   (OutputStreamWriter. ^OutputStream output-stream ^Charset StandardCharsets/UTF_8)
                 buffered-writer (BufferedWriter. output-writer)]
       (json/generate-stream response-seq buffered-writer opts)))))

(defn- wrap-streamed-json-response* [opts response]
  (if-let [json-response (and (coll? (:body response))
                              (update-in response [:body] streamed-json-response opts))]
    (if (contains? (:headers json-response) "Content-Type")
      json-response
      (rr/content-type json-response "application/json; charset=utf-8"))
    response))

(defn wrap-streamed-json-response
  "Similar to ring.middleware/wrap-json-response in that it will serialize the response's body to JSON if it's a
  collection. Rather than generating a string it will stream the response using a PipedOutputStream.

  Accepts the following options (same as `wrap-json-response`):

  :pretty            - true if the JSON should be pretty-printed
  :escape-non-ascii  - true if non-ASCII characters should be escaped with \\u"
  [handler & [{:as opts}]]
  (fn [request respond raise]
    (handler
     request
     (comp respond (partial wrap-streamed-json-response* opts))
     raise)))
