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

(defrecoverable not-curated!
  "The entity exists and the user can read it, but this Metabot only uses curated content and the entity isn't
  curated. Raised by `read_resource`, `list_available_fields`, `get_field_values`, `run_query`, and the tools that
  take an entity id, so one sentence covers every direct read."
  {:payload [:map {:closed true}
             ;; a URI or a short description such as "table 12": the entity is named by the handle the agent used,
             ;; never by its own name
             [:label :string]]}
  [{:keys [label]}]
  {:message  (str "`" label "` is not available: this Metabot only uses curated content (verified, official, or "
                  "Library content).")
   :recovery [{:uses #{"search"}
               :text "Call `search` to find curated tables, models, or metrics and use one of those instead."}]})
