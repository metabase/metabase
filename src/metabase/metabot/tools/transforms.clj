(ns metabase.metabot.tools.transforms
  "Tools for reading transform definitions."
  (:require
   [clojure.string :as str]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.transforms.core :as transforms]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; Formatting helpers
;;; ──────────────────────────────────────────────────────────────────

;; Hand-built rather than `clojure.data.xml` so query and body content stays verbatim:
;; data.xml escapes `<`/`>`/`&`, and an escaped query breaks `old_string` matching when
;; the model quotes it back to the write tools.
(defn- format-transform-details-output
  [{:keys [id description source target] :as transform}]
  (let [{source-type :type, :keys [query body source-database]} source]
    (->> [(str "<transform id=\"" id "\" name=\"" (llm-shape/escape-xml (:name transform)) "\">")
          (when description
            (str "  <description>" (llm-shape/escape-xml-content description) "</description>"))
          (when source
            (str "  <source type=\"" (some-> source-type name) "\">"))
          (when-let [query-text (some-> query llm-shape/transform-query->text)]
            (str "    <query>" query-text "</query>"))
          (when body
            (str "    <body>" body "</body>"))
          (when source-database
            (str "    <database>" source-database "</database>"))
          (when source
            "  </source>")
          (when target
            (str "  <target>" (llm-shape/escape-xml-content (pr-str target)) "</target>"))
          "</transform>"]
         (remove nil?)
         (str/join "\n"))))

(defn add-output
  "Add :output to a tool result. Handles both :structured_output and :structured-output."
  [result format-fn]
  (if-let [structured (or (:structured_output result) (:structured-output result))]
    (assoc result :output (format-fn structured))
    result))

;;; ──────────────────────────────────────────────────────────────────
;;; Tool definitions
;;; ──────────────────────────────────────────────────────────────────

(mu/defn ^{:tool-name "get_transform_details"
           :scope     scope/agent-transforms-read
           :capabilities #{:feature-transforms}}
  get-transform-details-tool
  "Get information about a transform."
  [{:keys [transform_id]} :- [:map {:closed true} [:transform_id :int]]]
  (try
    (add-output {:structured_output (transforms/get-transform transform_id)}
                format-transform-details-output)
    (catch Exception e
      (if (= 403 (:status-code (ex-data e)))
        ;; A permission refusal is an answer for the agent, not a tool failure -- relay the standard message.
        {:output (ex-message e) :status-code 403}
        (metabot.tools.u/handle-agent-error e)))))
