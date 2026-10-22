(ns metabase.metabot.tools.recoverable.common
  "Recoverable errors that more than one tool raises.

  An error belongs here only once a second tool needs it. A recoverable error declared for one tool
  lives in that tool's own namespace, so its code says where it came from and its text can stay
  specific."
  (:require
   [clojure.string :as str]
   [metabase.metabot.tools.error :refer [defrecoverable]]
   [metabase.util.quoting :as quoting]))

(set! *warn-on-reflection* true)

(def ^:private entity-kinds
  "The entity kinds [[not-found!]] can report on. A closed set because the kind reaches the model as
  a noun in English — an unexpected keyword would read as gibberish, and the payload check turns
  that into an `:internal` error instead."
  [:enum :card :chart :collection :dashboard :database :document :field :metric :model :query :question
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
   :recovery [(if (= kind :snippet)
                {:uses #{"list_snippets"}
                 :text "Call `list_snippets` to find an available snippet and use an id from the results."}
                {:uses #{"search"}
                 :text "Call `search` to find the entity you want and use an id from the results."})]})

(defrecoverable unknown-query-id!
  "The requested query is absent from the conversation."
  {:payload [:map {:closed true}
             [:query-id :string]
             [:available [:sequential :string]]]}
  [{:keys [query-id available]}]
  {:message (str "Query " (quoting/quoted query-id) " was not found. Available query IDs: "
                 (if (seq available) (str/join ", " (map quoting/quoted available)) "none") ".")
   :recovery [(if (seq available)
                {:uses #{} :text "Use an available query ID from this conversation."}
                {:uses #{"create_sql_query"}
                 :text "Use `create_sql_query` to create a SQL query, then use the returned query ID."})]})

(defrecoverable unknown-database!
  "The requested database does not exist."
  {:payload [:map {:closed true} [:database-id :int]]
   :status-code 404}
  [{:keys [database-id]}]
  {:message (str "Database " database-id " was not found.")
   :recovery [{:uses #{"read_resource"}
               :text "Read `metabase://databases` with `read_resource` to choose an available database ID, then retry."}]})
