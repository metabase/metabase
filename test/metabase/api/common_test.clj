(ns metabase.api.common-test
  (:require [clojure.core.async :as async]
            [expectations :refer :all]
            [metabase.api.common :as api :refer :all]
            [metabase.api.common.internal :refer :all]
            [metabase.middleware :as mb-middleware]
            [metabase.test.data :refer :all]
            [metabase.util.schema :as su]))

;;; TESTS FOR CHECK (ETC)

(def ^:private four-oh-four
  "The expected format of a 404 response."
  {:status  404
   :body    "Not found."
   :headers {"Cache-Control"                     "max-age=0, no-cache, must-revalidate, proxy-revalidate"
             "Content-Security-Policy"           (-> @#'mb-middleware/content-security-policy-header vals first)
             "Content-Type"                      "text/plain"
             "Expires"                           "Tue, 03 Jul 2001 06:00:00 GMT"
             "Last-Modified"                     true ; this will be current date, so do update-in ... string?
             "Strict-Transport-Security"         "max-age=31536000"
             "X-Content-Type-Options"            "nosniff"
             "X-Frame-Options"                   "DENY"
             "X-Permitted-Cross-Domain-Policies" "none"
             "X-XSS-Protection"                  "1; mode=block"}})

(defn ^:private my-mock-api-fn []
  ((mb-middleware/catch-api-exceptions
    (fn [_]
      (check-404 @*current-user*)
      {:status 200
       :body   @*current-user*}))
   nil))

; check that `check-404` doesn't throw an exception if TEST is true
(expect {:status 200
         :body "Cam Saul"}
  (binding [*current-user* (atom "Cam Saul")]
    (my-mock-api-fn)))

; check that 404 is returned otherwise
(expect
  four-oh-four
  (-> (my-mock-api-fn)
      (update-in [:headers "Last-Modified"] string?)))

;;let-404 should return nil if test fails
(expect
  four-oh-four
  (-> ((mb-middleware/catch-api-exceptions
        (fn [_]
          (let-404 [user nil]
            {:user user})))
       nil)
      (update-in [:headers "Last-Modified"] string?)))

;; otherwise let-404 should bind as expected
(expect
  {:user {:name "Cam"}}
  ((mb-middleware/catch-api-exceptions
    (fn [_]
      (let-404 [user {:name "Cam"}]
        {:user user})))
   nil))


(defmacro ^:private expect-expansion
  "Helper to test that a macro expands the way we expect;
   Automatically calls `macroexpand-1` on MACRO."
  {:style/indent 0}
  [expected-expansion macro]
  `(let [actual-expansion# (macroexpand-1 '~macro)]
     (expect '~expected-expansion
       actual-expansion#)))


;;; TESTS FOR AUTO-PARSE
;; TODO - these need to be moved to `metabase.api.common.internal-test`. But first `expect-expansion` needs to be put
;; somewhere central

;; when auto-parse gets an args form where arg is present in *autoparse-types*
;; the appropriate let binding should be generated
(expect-expansion (clojure.core/let [id (clojure.core/when id (metabase.api.common.internal/parse-int id))] 'body)
                  (auto-parse [id] 'body))

;; params not in *autoparse-types* should be ignored
(expect-expansion (clojure.core/let [id (clojure.core/when id (metabase.api.common.internal/parse-int id))] 'body)
                  (auto-parse [id some-other-param] 'body))

;; make sure multiple autoparse params work correctly
(expect-expansion (clojure.core/let [id (clojure.core/when id (metabase.api.common.internal/parse-int id))
                                     org_id (clojure.core/when org_id (metabase.api.common.internal/parse-int org_id))] 'body)
                  (auto-parse [id org_id] 'body))

;; make sure it still works if no autoparse params are passed
(expect-expansion (clojure.core/let [] 'body)
                  (auto-parse [some-other-param] 'body))

;; should work with no params at all
(expect-expansion (clojure.core/let [] 'body)
                  (auto-parse [] 'body))

;; should work with some wacky binding form
(expect-expansion (clojure.core/let [id (clojure.core/when id (metabase.api.common.internal/parse-int id))] 'body)
                  (auto-parse [id :as {body :body}] 'body))

;;; TESTS FOR DEFENDPOINT

;; replace regex `#"[0-9]+"` with str `"#[0-9]+" so expectations doesn't barf
(binding [*auto-parse-types* (update-in *auto-parse-types* [:int :route-param-regex] (partial str "#"))]
  (expect-expansion
    (def GET_:id
      (GET ["/:id" :id "#[0-9]+"] [id]
           (metabase.api.common.internal/auto-parse [id]
             (metabase.api.common.internal/validate-param 'id id su/IntGreaterThanZero)
             (metabase.api.common.internal/wrap-response-if-needed (do (select-one Card :id id))))))
    (defendpoint GET "/:id" [id]
      {id su/IntGreaterThanZero}
      (select-one Card :id id))))

(def ^:private long-timeout
  ;; 2 minutes
  (* 2 60000))

(defn- take-with-timeout [response-chan]
  (let [[response c] (async/alts!! [response-chan
                                    ;; We should never reach this unless something is REALLY wrong
                                    (async/timeout long-timeout)])]
    (when (and (nil? response)
               (not= c response-chan))
      (throw (Exception. "Taking from streaming endpoint timed out!")))

    response))

(defn- wait-for-future-cancellation
  "Once a client disconnects, the next heartbeat sent will result in an exception that should cancel the future. In
  theory 1 keepalive-interval should be enough, but building in some wiggle room here for poor concurrency timing in
  tests."
  [fut]
  (let [keepalive-interval (var-get #'api/streaming-response-keep-alive-interval-ms)
        max-iterations     (long (/ long-timeout keepalive-interval))]
    (loop [i 0]
      (if (or (future-cancelled? fut) (> i max-iterations))
        fut
        (do
          (Thread/sleep keepalive-interval)
          (recur (inc i)))))))

;; This simulates 2 keepalive-intervals followed by the query response
(expect
  [\newline \newline {:success true} false]
  (let [send-response (promise)
        {:keys [output-channel error-channel response-future]} (#'api/invoke-thunk-with-keepalive (fn [] @send-response))]
    [(take-with-timeout output-channel)
     (take-with-timeout output-channel)
     (do
       (deliver send-response {:success true})
       (take-with-timeout output-channel))
     (future-cancelled? response-future)]))

;; This simulates an immediate query response
(expect
  [{:success true} false]
  (let [{:keys [output-channel error-channel response-future]} (#'api/invoke-thunk-with-keepalive (fn [] {:success true}))]
    [(take-with-timeout output-channel)
     (future-cancelled? response-future)]))

;; This simulates a closed connection from the client, should cancel the future
(expect
  [\newline \newline true]
  (let [send-response (promise)
        {:keys [output-channel error-channel response-future]} (#'api/invoke-thunk-with-keepalive (fn [] (Thread/sleep long-timeout)))]
    [(take-with-timeout output-channel)
     (take-with-timeout output-channel)
     (do
       (async/close! output-channel)
       (future-cancelled? (wait-for-future-cancellation response-future)))]))

;; When an immediate exception happens, we should know that via the error channel
(expect
  ;; Each channel should have the failure and then get closed
  ["It failed" "It failed" nil nil]
  (let [{:keys [output-channel error-channel response-future]} (#'api/invoke-thunk-with-keepalive (fn [] (throw (Exception. "It failed"))))]
    [(.getMessage (take-with-timeout error-channel))
     (.getMessage (take-with-timeout output-channel))
     (async/<!! error-channel)
     (async/<!! output-channel)]))

;; This simulates a slow failure, we'll still get an exception, but the error channel is closed, so at this point
;; we've assumed it would be a success, but it wasn't
(expect
  [\newline nil \newline "It failed" false]
  (let [now-throw-exception (promise)
        {:keys [output-channel error-channel response-future]} (#'api/invoke-thunk-with-keepalive
                                                                (fn [] @now-throw-exception (throw (Exception. "It failed"))))]
    [(take-with-timeout output-channel)
     (take-with-timeout error-channel)
     (take-with-timeout output-channel)
     (do
       (deliver now-throw-exception true)
       (.getMessage (take-with-timeout output-channel)))
     (future-cancelled? response-future)]))
