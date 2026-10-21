(ns metabase.metabot.tools.recoverable.common
  "Recoverable errors that more than one tool raises.

  An error belongs here only once a second tool needs it. A recoverable error declared for one tool
  lives in that tool's own namespace, so its code says where it came from and its text can stay
  specific."
  (:require
   [clojure.string :as str]
   [metabase.metabot.tools.error :refer [defrecoverable]]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private entity-kinds
  "The entity kinds [[not-found!]] can report on. A closed set because the kind reaches the model as
  a noun in English — an unexpected keyword would read as gibberish, and the payload check turns
  that into an `:internal` error instead."
  [:enum :card :chart :collection :dashboard :database :document :field :metric :model :question
   :segment :measure :snippet :table :timeline :transform])

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
   :recovery [{:uses #{"search"}
               :text "Call `search` to find the entity you want and use an id from the results."}]})

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
