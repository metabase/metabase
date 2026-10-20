(ns metabase.metabot.tools.recoverable.common
  "Recoverable errors that more than one tool raises.

  An error belongs here only once a second tool needs it. A recoverable error declared for one tool
  lives in that tool's own namespace, so its code says where it came from and its text can stay
  specific."
  (:require
   [clojure.string :as str]
   [metabase.metabot.tools.error :refer [defrecoverable]]))

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
                 ;; Both optional because the two converters know different amounts.
                 ;; `with-entity` wraps a specific lookup and names the entity; a 403 or 404 that
                 ;; surfaces from deep inside the representations pipeline often does not say which
                 ;; reference failed, and inventing a kind would be worse than omitting it.
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

(defrecoverable unknown-chart-id!
  "The chart id is not one of the charts this conversation holds."
  {:payload [:map {:closed true}
             [:chart-id  :string]
             [:available [:sequential :string]]]}
  [{:keys [chart-id available]}]
  {:message  (str "No chart with id " (pr-str chart-id) " exists in this conversation."
                  (if (seq available)
                    (str " The chart ids that do: " (str/join ", " available) ".")
                    " No charts have been created in it yet."))
   :recovery [{:uses #{"construct_notebook_query"}
               :text "To make a new chart, call `construct_notebook_query` and use the chart id it returns."}
              {:uses #{"create_chart"}
               :text "To chart a query this conversation already holds, call `create_chart` with its query id."}]})
