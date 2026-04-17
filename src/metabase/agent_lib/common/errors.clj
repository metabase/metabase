(ns metabase.agent-lib.common.errors
  "Error helpers for structured MBQL program repair, validation, and evaluation."
  (:require
   [clojure.string :as str]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(defn path->string
  "Render a validation path vector into a dotted path string."
  [path]
  (if (empty? path)
    "<root>"
    (str/join ""
              (map-indexed
               (fn [idx segment]
                 (cond
                   (integer? segment) (str "[" segment "]")
                   (zero? idx)        (name segment)
                   :else              (str "." (name segment))))
               path))))

(defn invalid-program!
  "Throw a standardized invalid structured program exception."
  [path message & [data]]
  (throw (ex-info (tru "Generated program is invalid.")
                  (merge
                   {:status-code 400
                    :error       :invalid-generated-program
                    :path        (path->string path)
                    :details     (str (path->string path) ": " message)}
                   data))))

(def ^:private recovery-keys
  "Keys that carry agent-recovery hints through the error chain."
  [:available :tables :suggestion])

(defn lookup-error!
  "Throw a structured lookup error with optional recovery hints.
  `message` is the clean, user-safe string (no schema enumeration).
  `data` identifies the failed entity (e.g. `{:table-id 42}`).
  `recovery` is an optional map with agent-facing hints:
    :available  - seq of valid names/values
    :tables     - seq of matching tables (for disambiguation)
    :suggestion - corrective suggestion string"
  ([message data]
   (lookup-error! message data nil))
  ([message data recovery]
   (throw (ex-info message
                   (cond-> (assoc data
                                  :status-code 400
                                  :error       :invalid-generated-program)
                     (seq recovery) (assoc :recovery recovery))))))

(defn wrap-runtime-error
  "Wrap a runtime exception into the standard invalid-program shape,
  preserving structured recovery data from the cause's ex-data."
  [path op-name ^Throwable cause]
  (let [cause-data (ex-data cause)
        recovery   (or (:recovery cause-data)
                       (not-empty (select-keys cause-data recovery-keys)))]
    (ex-info (tru "Generated program could not be evaluated.")
             (cond-> {:status-code 400
                      :error       :invalid-generated-program
                      :path        (path->string path)
                      :details     (str (path->string path) ": " (ex-message cause))
                      :operator    op-name}
               recovery (assoc :recovery recovery))
             cause)))

(defn recovery-summary
  "Format the `:recovery` map from an exception's ex-data into a string
  suitable for LLM retry feedback. Returns nil when there are no hints."
  [{:keys [available tables suggestion]}]
  (let [parts (cond-> []
                (seq available)  (conj (str "Available: " (str/join ", " (take 20 available))))
                (seq tables)     (conj (str "Matching tables: " (str/join ", " tables)))
                suggestion       (conj suggestion))]
    (when (seq parts)
      (str/join "\n" parts))))
