(ns metabase.ai-tracing.api
  "HTTP endpoint for reading captured eval traces by session id.

  Gated two ways: the route is only mounted/served when `MB_AI_EVAL_CAPTURE` is enabled
  (`+eval-capture-enabled`, mirroring `+agent-api-enabled` / `+mcp-enabled`), and each request
  additionally requires a superuser — traces contain full, unredacted prompts and content, so this
  is intended for dedicated eval instances only."
  (:require
   [clojure.java.io :as io]
   [metabase.ai-tracing.settings :as ai-tracing.settings]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :as routes.common]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(defn- trace-dir
  "Directory the eval-trace RoutingAppender writes to — mirrors the log4j2 path
   `${sys:logfile.path:-target/log}/eval-traces`."
  ^File []
  (io/file (or (System/getProperty "logfile.path") "target/log") "eval-traces"))

;; Safe filename: must start alphanumeric, then alphanumerics / `.` `_` `-`. No `/` ⇒ no path
;; traversal; the leading-alphanumeric rule also rejects ids starting with `.` (e.g. `..`).
(def ^:private safe-session-id-re #"[A-Za-z0-9][A-Za-z0-9._-]*")

(defn- trace-file
  "Resolve the JSONL file for `session-id`, or nil if the id is unsafe or would escape the trace dir."
  ^File [session-id]
  (when (re-matches safe-session-id-re (str session-id))
    (let [dir (.getCanonicalFile (trace-dir))
          f   (.getCanonicalFile (io/file dir (str session-id ".jsonl")))]
      ;; defense in depth: the resolved file must sit directly inside the trace dir
      (when (= dir (.getParentFile f))
        f))))

(api.macros/defendpoint :get "/:session-id" :- :any
  "Return the captured eval trace as JSONL (one span per line) for `session-id`. Superuser-only;
   served only when `MB_AI_EVAL_CAPTURE` is enabled."
  [{:keys [session-id]} :- [:map [:session-id ms/NonBlankString]]]
  (api/check-superuser)
  (let [f (trace-file session-id)]
    (api/check (and f (.exists ^File f)) [404 (tru "Eval trace not found")])
    ;; Return the File directly so Ring streams it — a per-session trace can be many MB of full
    ;; prompts/completions, which we don't want to slurp into the heap.
    {:status  200
     :headers {"Content-Type" "application/x-ndjson"}
     :body    ^File f}))

(defn- enforce-eval-capture-enabled
  "Ring middleware: 404 (endpoint invisible) when eval capture is disabled."
  [handler]
  (fn [request respond raise]
    (if (ai-tracing.settings/ai-eval-capture)
      (handler request respond raise)
      (raise (ex-info (tru "Eval capture is not enabled.") {:status-code 404})))))

(def ^{:arglists '([handler])} +eval-capture-enabled
  "Wrap routes so they may only be accessed when eval capture is enabled."
  (routes.common/wrap-middleware-for-open-api-spec-generation enforce-eval-capture-enabled))

(def ^{:arglists '([request respond raise])} routes
  "`/api/eval-trace/` routes."
  (api.macros/ns-handler *ns*))
