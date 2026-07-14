(ns metabase.agent-api.run-saved-question
  "The v2 `run_saved_question` tool: run a card the caller already has, with values for the filters it declares.

   A saved question is a query someone already got right, so running one is not a lesser `execute_query` — it is
   the shortest path from a question asked in chat to the number a team has already agreed on. What v1 could not
   do was supply the filter values, and a question with a filter is most of the questions worth saving: v1's
   `execute_question` refused a parameterized card outright.

   `parameters` are resolved against the card's **declared** parameter list
   ([[metabase.query-processor.card/resolve-declared-parameters]]), by id or by the slug a person sees, and the
   column a value filters is read off the card's own declaration — a call supplies the value and nothing else.
   Pair it with `get_parameter_values`: a value the warehouse does not spell that way matches no rows, and an
   empty result reads as an answer.

   `export` hands back a link rather than bytes — a chat client can do nothing with a megabyte of base64, and
   the person reading the chat wants a file. The file is generated here, through the app's own export machinery
   and under the app's own download permissions, and stored ([[metabase.agent-api.exports]]) so that the rows
   this call reported and the rows in the downloaded file are the same rows: a link that re-ran the query when
   it was clicked would be answering the question again, at a different time, and quietly disagreeing."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.agent-api.exports :as exports]
   [metabase.agent-api.results :as results]
   [metabase.agent-api.tools :as tools]
   [metabase.api.common :as api]
   [metabase.query-processor.api :as qp.api]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.query-processor.streaming.common :as streaming.common]
   [metabase.query-processor.streaming.interface :as qp.si]
   [metabase.util.malli :as mu])
  (:import
   (java.io ByteArrayOutputStream)))

(set! *warn-on-reflection* true)

(def export-formats
  "Every `export` format the tool takes. The query processor's own `:api` shape is not one of them: an export is
   a file a person opens."
  ["csv" "xlsx" "json"])

(def ^:private Params
  "The arguments [[run-saved-question]] contracts on. `POST /v2/run-saved-question` declares the wire schema,
   with the bounds a client is held to; this is the looser shape the domain function accepts."
  [:map
   [:id              [:or :int :string]]
   [:parameters      {:optional true} [:maybe [:sequential [:map
                                                            [:id    {:optional true} [:maybe :string]]
                                                            [:slug  {:optional true} [:maybe :string]]
                                                            [:value {:optional true} :any]]]]]
   [:export          {:optional true} [:maybe :string]]
   [:row_limit       {:optional true} [:maybe :int]]
   [:offset          {:optional true} [:maybe :int]]
   [:response_format {:optional true} [:maybe :string]]])

;;; ──────────────────────────────────────────────────────────────────
;;; Parameters
;;; ──────────────────────────────────────────────────────────────────

(defn- catalog
  "The card's parameters, as the refusal that names them spells them."
  [declared]
  (if (empty? declared)
    "It declares no parameters at all — run it without any."
    (str "It declares: "
         (str/join ", " (for [{:keys [id slug name]} declared]
                          (str "`" (or slug id) "`"
                               (when (and name (not= name slug)) (str " — " name))
                               " (id `" id "`)")))
         ".")))

(defn- parameter-id
  "Which of the card's parameters a call's entry names.

   A slug is what the filter widget is called and what `get_content` reports; an id is what the REST parameter
   list is keyed by. The agent has read both, and should not have to know which one this endpoint happens to
   want, so either resolves here."
  [declared by-id by-slug {:keys [id slug]}]
  (cond
    (and id slug)
    (tools/teaching-error!
     (str "Name a parameter by its `id` or by its `slug`, not both. " (catalog declared)))

    id
    (or (by-id id)
        (tools/teaching-error!
         (str "This question has no parameter with id `" id "`. " (catalog declared))))

    slug
    (or (by-slug slug)
        (tools/teaching-error!
         (str "This question has no parameter with slug `" slug "`. " (catalog declared))))

    :else
    (tools/teaching-error!
     (str "Every parameter needs an `id` or a `slug` saying which filter it sets. " (catalog declared)))))

(defn- resolve-parameters
  "The parameters the query processor takes, from the `{id | slug, value}` entries a call names: the slug maps to
   the id it names, and [[qp.card/resolve-declared-parameters]] reads the rest — the value's type, and the column
   it filters — off the card's own declaration."
  [card parameters]
  (when (seq parameters)
    (let [declared (qp.card/combined-parameters-and-template-tags card)
          by-id    (into {} (map (juxt :id :id)) declared)
          by-slug  (into {} (keep (fn [{:keys [id slug]}] (when slug [slug id]))) declared)]
      (qp.card/resolve-declared-parameters
       card
       (mapv (fn [{:keys [value] :as parameter}]
               {:id (parameter-id declared by-id by-slug parameter) :value value})
             parameters)))))

;;; ──────────────────────────────────────────────────────────────────
;;; Running the card
;;; ──────────────────────────────────────────────────────────────────

(defn- run-card!
  "Run `card` through the app's own card-query path. `make-run` shapes what comes back; everything else in
   `options` is `process-query-for-card`'s own.

   Every check a browser's run passes, this run passes: the card's read check, the caller's permission on the
   tables behind it, their sandbox, and — on an export — the download-permission tiers. The parameters are
   resolved against the card's declaration on the way in, which is what
   [[qp.card/*allow-arbitrary-mbql-parameters*]] is bound for: the check it stands down is the one that knows
   only about native template tags, and it is the same reason the dashboard path binds it."
  [card export-format parameters make-run options]
  (binding [qp.card/*allow-arbitrary-mbql-parameters* true]
    (m/mapply qp.card/process-query-for-card card export-format
              (assoc options
                     :parameters (resolve-parameters card parameters)
                     :make-run   make-run))))

(defn- read-page
  "The `:make-run` that reads one page of the card's result.

   `process-query-for-card` builds the card's query and hands it here, which is the only place the page can be
   cut from — and the right one: how a query pages is a property of the query, not of the tool holding it, and a
   card carries whichever kind it was saved as."
  [{:keys [offset row-limit response-format]}]
  (fn [qp _export-format]
    (fn [query info]
      (let [pager (results/pager query offset row-limit)]
        (results/page-response pager
                               (results/execute! #(qp (results/window pager (update query :info merge info)) nil))
                               {:response-format response-format})))))

(defn- write-file
  "The `:make-run` that writes the card's whole result into `os`, with the streaming writer the app's own
   Download Results button uses."
  [os]
  (fn [qp export-format]
    (fn [query info]
      (qp.streaming/do-with-streaming-rff
       export-format os
       (fn [rff] (results/execute! #(qp (update query :info merge info) rff)))))))

;;; ──────────────────────────────────────────────────────────────────
;;; The tool
;;; ──────────────────────────────────────────────────────────────────

(defn- run-export!
  "Generate `card`'s result as a file, store it, and return the link that downloads it.

   The `:context` is the app's own download context, and it is what carries the enterprise download-permission
   tiers: the middleware that refuses a caller with no download permission, and the one that caps the limited
   tier at ten thousand rows, both recognize a download by exactly this context. Run an export under any other
   one and the tiers silently do not apply."
  [card export parameters]
  (let [export-format (keyword export)
        file-name     (str (qp.streaming/safe-filename-prefix (:name card))
                           "_" (streaming.common/export-filename-timestamp)
                           "." export)
        os            (ByteArrayOutputStream.)
        overflowed    (volatile! false)
        {:keys [row_count]}
        (run-card! card export-format parameters
                   (write-file (exports/bounded-output-stream os overflowed))
                   {;; `nil` rather than the userland default: an export carries the whole result, bounded by
                    ;; the instance's download row limit and by the caller's download tier.
                    :constraints nil
                    :context     (qp.api/export-format->context export-format)
                    :middleware  {:process-viz-settings?  true
                                  :skip-results-metadata? true
                                  :ignore-cached-results? true
                                  :js-int-to-string?      false}})
        _ (when @overflowed (exports/too-large-error!))
        {:keys [id expires_at]}
        (exports/store-export! api/*current-user-id*
                               {:card-id      (:id card)
                                :filename     file-name
                                :content-type (:content-type (qp.si/stream-options export-format))
                                :row-count    row_count
                                :content      (.toByteArray os)})]
    {:download_url (exports/export-url id)
     :filename     file-name
     :row_count    row_count
     :expires_at   (str expires_at)}))

(mu/defn run-saved-question :- :map
  "Run a saved question, model, or metric by id, with values for the filters it declares. See the tool's
   description on `POST /v2/run-saved-question` for the argument contract."
  [{:keys [id parameters export row_limit offset response_format]} :- Params]
  (let [card (api/read-check :model/Card (tools/resolve-id :model/Card id))]
    (if export
      (do
        (when (or row_limit offset)
          (tools/teaching-error!
           (str "`export` returns the whole result as a file, so `row_limit` and `offset` — which page an "
                "inline read — do not apply to it. Drop them, or drop `export` to read the rows here.")))
        (run-export! card export parameters))
      (run-card! card :api parameters
                 (read-page {:offset          (or offset 0)
                             :row-limit       (tools/clamp-limit row_limit
                                                                 results/default-row-limit
                                                                 results/max-row-limit)
                             :response-format response_format})
                 {:context    :question
                  :middleware {:process-viz-settings? false}}))))
