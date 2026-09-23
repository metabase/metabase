(ns mage.papercuts.jev
  "Screens transcript chunks for papercuts with TypeSafe's Jev model (https://docs.typesafe.ai/api).
  Jev only prioritises: a flagged chunk still goes to a drill-down agent, which decides whether it holds a papercut."
  (:require
   [babashka.http-client :as http]
   [babashka.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private endpoint "https://api.typesafe.ai/v1/systemone")

(def ^:private context
  (str "`transcript` is a new stretch of a coding agent's session log (Claude Code or Codex), mostly in the Metabase "
       "Clojure/TypeScript monorepo. `earlier` is the stretch before it, already reviewed; judge only what happens in "
       "`transcript`. Lines are tagged USER, ASSISTANT, THINKING, TOOL (a call) and RESULT (its output). "
       "Ordinary iteration does not count: a compile error fixed on the next try, a test written to fail first, "
       "reading files to learn the code, or a normal CI wait."))

(defn- noul [question yes no]
  {:type         "noul"
   :instructions {:context context :question question}
   :criteria     {:true yes :false no}})

(def questions
  "Yes/no questions asked of every chunk.
  Calibrated on the 2026-09 corpus: a generic tool-misuse or environment-friction question fired on almost every
  chunk, and a generic user-correction question fired on style feedback, so these are narrower."
  {:self_inflicted_bug
   (noul "Did the agent make a code or config change that turned out to be wrong (a bug, broken test, wrong semantics, wrong file) which the agent or the user later caught and had to fix or revert?"
         "A concrete earlier change by the agent is later found to be wrong and is corrected."
         "No change by the agent is later found wrong, or only trivial typos.")
   :misleading_signal
   (noul "Did a tool, test, linter, REPL, or command give output that misled the agent: success reported when something failed, stale or cached state, a passing check that proved nothing, a silently skipped step, or an error message pointing at the wrong cause?"
         "The agent drew a wrong conclusion, or nearly did, because of misleading output."
         "Outputs were accurate and the agent read them correctly.")
   :codebase_trap
   (noul "Was the agent tripped up by something surprising in the codebase itself: confusingly similar names, hidden side effects, undocumented invariants or conventions, misleading docstrings or comments, duplicated logic that must stay in sync, or an API whose shape invites misuse?"
         "A specific feature of the code led the agent into a mistake or significant wasted effort."
         "The agent was not misled by the code's design.")
   :factual_correction
   (noul "Did the user correct a factual or technical error by the agent: a wrong claim, a wrong diagnosis, a broken change, or a violated project rule?"
         "The user points out that something the agent did or concluded was technically wrong."
         "The user gave no correction, or only style, tone, wording or design-preference feedback.")
   :tool_interface
   (noul "Did a tool, script, CLI or shell behave differently from what its name, flags, docs or usual conventions suggest, so that a correct-looking invocation failed or did the wrong thing?"
         "The surprise came from the tool's interface or environment, not from a typo or a plain mistake by the agent."
         "Tools behaved as documented, or the agent simply mistyped a command.")
   :flailing
   (noul "Did the agent spend several attempts on one thing before it worked or was abandoned: retrying variations, reverting its own work, or hunting for how to do something that should be easy?"
         "Three or more attempts at the same step, or an approach abandoned after real effort."
         "Work proceeds fairly directly.")})

(defn screen!
  "Ask Jev every question about one chunk. Returns `{:scores {question probability} :model ... :usage ...}`.
  Retries on rate limits and server errors; throws on anything else."
  [api-key {:keys [earlier text]}]
  (let [body (json/write-str {:model     "jev-latest"
                              :state     {:earlier (or earlier "") :transcript text}
                              :questions questions})]
    (loop [attempt 0]
      (let [{:keys [status body headers]}
            (http/post endpoint {:headers {"Authorization" (str "Bearer " api-key)
                                           "Content-Type"  "application/json"}
                                 :body    body
                                 :timeout 180000
                                 :throw   false})]
        (cond
          (= 200 status)
          (let [{:keys [answers model usage]} (json/read-str body)]
            {:scores (update-vals answers :noul) :model model :usage usage})

          ;; 529 is Jev's "system overloaded", which passes like a 503.
          (and (#{429 500 502 503 504 529} status) (< attempt 7))
          (do (Thread/sleep (long (* 1000 (or (some-> (get headers "retry-after") parse-double)
                                              (Math/pow 2 attempt)))))
              (recur (inc attempt)))

          :else
          (throw (ex-info (str "Jev returned HTTP " status) {:status status :body (subs (str body) 0 (min 300 (count (str body))))})))))))

(defn flagged?
  "True when any question's probability reaches `threshold`."
  [scores threshold]
  (boolean (some #(>= % threshold) (vals scores))))
