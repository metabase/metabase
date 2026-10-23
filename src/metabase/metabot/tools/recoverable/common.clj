(ns metabase.metabot.tools.recoverable.common
  "Recoverable errors that more than one tool raises.

  An error belongs here only once a second tool needs it. A recoverable error declared for one tool
  lives in that tool's own namespace, so its code says where it came from and its text can stay
  specific."
  (:require
   [clojure.string :as str]
   [metabase.metabot.tools.error :as tools.error :refer [defrecoverable]]
   [metabase.util :as u]
   [metabase.util.quoting :as quoting]))

(set! *warn-on-reflection* true)

(def ^:private entity-kinds
  "The entity kinds [[not-found!]] can report on. A closed set because the kind reaches the model as
  a noun in English — an unexpected keyword would read as gibberish, and the payload check turns
  that into an `:internal` error instead."
  [:enum :card :chart :collection :dashboard :database :document :field :metric :model :query :question
   :segment :measure :snippet :table :timeline :transform])

(def ^:private finder-tools
  "The tool that lists entities of each kind `search` does not return. [[not-found!]] offers it as
  the recovery step, and `search` for a kind missing here."
  {:snippet  "list_snippets"
   :timeline "list_timelines"})

(defrecoverable not-found!
  "The entity does not exist, or the current user cannot read it."
  {:payload     [:map {:closed true}
                 ;; Both optional because the converters know different amounts. `with-entity`
                 ;; wraps a specific lookup and names the entity; a 403 or 404 that surfaces from
                 ;; deep inside the representations pipeline or an unconverted tool often does not
                 ;; say which reference failed, and inventing a kind would be worse than omitting it.
                 [:kind {:optional true} entity-kinds]
                 [:id   {:optional true} [:or :string :int]]]
   :status-code 404}
  [{:keys [kind id]}]
  ;; A 403 and a 404 give the same sentence on purpose. Telling the agent that something exists but
  ;; is forbidden leaks the existence of content the user cannot see, and the agent's next move is
  ;; the same either way.
  {:message  (str (if (and kind id)
                    (str (str/capitalize (name kind)) " " id)
                    "The entity referenced here")
                  " was not found. It may not exist, or you may not have access to it.")
   :recovery (let [finder (get finder-tools kind "search")]
               [{:uses #{finder}
                 :text (str "Call `" finder "` to find the entity you want and use an id from the results.")}])})

(def ^:private max-query-id-chars
  "The most characters of the requested query ID that [[unknown-query-id!]] repeats.
  The model supplies the ID, so its length is otherwise unbounded."
  100)

(defn- available-query-ids-text
  "`ids` quoted and joined within `room` characters: the leading IDs that fit whole, then a count of the rest."
  [ids room]
  (let [quoted          (mapv quoting/quoted ids)
        n               (count quoted)
        running-lengths (reductions + (map-indexed (fn [i id] (+ (count id) (if (pos? i) 2 0))) quoted))]
    (cond
      (zero? n)                        "none"
      (<= (last running-lengths) room) (str/join ", " quoted)
      :else
      (let [limit (- room (count (str " and " n " more")))
            shown (count (take-while #(<= % limit) running-lengths))]
        (if (pos? shown)
          (str (str/join ", " (take shown quoted)) " and " (- n shown) " more")
          (str n ", too long to list"))))))

(defn- unknown-query-id-advice
  "What [[unknown-query-id!]] tells the model to do for `hint`: a `:sentence` after its message, and its `:recovery`."
  [hint any-available?]
  (let [use-available {:uses #{} :text "Use an available query ID from this conversation."}]
    (case hint
      nil
      {:recovery [(if any-available?
                    use-available
                    {:uses #{"create_sql_query"}
                     :text "Use `create_sql_query` to create a SQL query, then use the returned query ID."})]}

      :notebook-only
      {:recovery [(if any-available?
                    use-available
                    {:uses #{"construct_notebook_query"}
                     :text "Use `construct_notebook_query` to build a query, then use the returned query ID."})]}

      :notebook-query
      {:sentence " Use the ID of a query that you built, or a saved question or model that the user can read."
       :recovery []}

      :sql-query
      {:sentence " A saved question or model has no query ID."
       :recovery [{:uses #{"create_sql_query" "run_query"}
                   :text (str "To run one, write SQL that reads it with `create_sql_query`, then run that query"
                              " with `run_query`.")}]}

      :no-values
      {:sentence " A saved question or model has no query ID, and no SQL can run here."
       :recovery [{:uses #{} :text "Tell the user you can't read its results."}]})))

(defrecoverable unknown-query-id!
  "The query ID names no query that the tool can use for the current user.

  `:hint` picks the recovery. By default the model uses a listed ID or creates a SQL query, and `:notebook-only`
  offers a notebook query instead. `run_query` passes one of the others for its profile, since it also runs saved
  questions by ID."
  {:payload [:map {:closed true}
             [:query-id  :string]
             [:available [:sequential :string]]
             [:hint      {:optional true} [:enum :notebook-only :notebook-query :sql-query :no-values]]]}
  [{:keys [query-id available hint]}]
  (let [{:keys [sentence recovery]} (unknown-query-id-advice hint (boolean (seq available)))
        opening                     (str "Query " (quoting/quoted (u/truncate query-id max-query-id-chars))
                                         " was not found. Available query IDs: ")
        ;; The IDs get only the room left by the rest, so a long list never pushes the advice past the runtime's cut
        room                        (tools.error/output-budget (str opening "." sentence) recovery)]
    {:message  (str opening (available-query-ids-text available room) "." sentence)
     :recovery recovery}))

(defrecoverable unknown-database!
  "The requested database does not exist."
  {:payload [:map {:closed true} [:database-id :int]]
   :status-code 404}
  [{:keys [database-id]}]
  {:message (str "Database " database-id " was not found.")
   :recovery [{:uses #{"read_resource"}
               :text "Read `metabase://databases` with `read_resource` to choose an available database ID, then retry."}
              {:uses #{"document_schema_collect"}
               :text "Call `document_schema_collect`, then retry with the `database_id` it returns."}]})

(def ^:private max-listed-chart-ids
  "The most chart IDs that [[unknown-chart-id!]] lists.
  With each ID cut to [[max-chart-id-chars]], the recovery steps after the list stay within the runtime's
  4,000-character limit on failure text."
  30)

(def ^:private max-chart-id-chars
  "The most characters of a chart ID that [[unknown-chart-id!]] repeats.
  The model supplies the requested ID, so its length is otherwise unbounded."
  100)

(defrecoverable unknown-chart-id!
  "The chart ID does not belong to a chart in this conversation."
  {:payload [:map {:closed true}
             [:chart-id  :string]
             [:available [:sequential :string]]]}
  [{:keys [chart-id available]}]
  (let [more (- (count available) max-listed-chart-ids)]
    {:message  (str "No chart with ID " (pr-str (u/truncate chart-id max-chart-id-chars))
                    " exists in this conversation."
                    (if (seq available)
                      (str " The available chart IDs are "
                           (str/join ", " (map #(u/truncate % max-chart-id-chars)
                                               (take max-listed-chart-ids available)))
                           (when (pos? more) (str " and " more " more"))
                           ".")
                      " No charts have been created in this conversation yet."))
     :recovery [{:uses #{"construct_notebook_query"}
                 :text "To make a new chart, call `construct_notebook_query` and use the chart ID that it returns."}
                {:uses #{"create_chart"}
                 :text "To chart a query from this conversation, call `create_chart` with its query ID."}]}))
