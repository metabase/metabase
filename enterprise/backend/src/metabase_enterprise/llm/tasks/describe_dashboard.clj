(ns metabase-enterprise.llm.tasks.describe-dashboard
  "LLM task(s) for generating dashboard descriptions"
  (:require
   [cheshire.core :as json]
   [clojure.set :refer [rename-keys]]
   [clojure.walk :as walk]
   [metabase-enterprise.llm.client :as llm-client]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- dashboard->prompt-data
  "Create a data-oriented summary of a dashboard as input to an LLM for summarization."
  [dashboard-id]
  (let [{dashboard-name :name :keys [parameters dashcards]}
        (t2/hydrate (t2/select-one :model/Dashboard dashboard-id) [:dashcards
                                                                   :card
                                                                   :series
                                                                   :dashcard/action
                                                                   :dashcard/linkcard-info]
                    :tabs
                    :param_fields
                    :param_values)
        param-id->param (zipmap
                          (map :id parameters)
                          (map (fn [param]
                                 (-> (select-keys param [:name :type])
                                     (rename-keys {:name :parameter-name :type :filter-type})
                                     (update :filter-type name)))
                               parameters))]
    {:dashboard-name    dashboard-name
     :charts            (for [{:keys [card parameter_mappings]} dashcards
                              :let [{card-name :name
                                     :keys     [display
                                                description
                                                visualization_settings
                                                result_metadata]} card
                                    field-name->display-name (zipmap
                                                               (map :name result_metadata)
                                                               (mapv (some-fn :display_name :name) result_metadata))
                                    visualization_settings   (->> visualization_settings
                                                                  u/remove-nils
                                                                  (walk/prewalk (fn [v] (field-name->display-name v v))))]]
                          (cond->
                            {:chart-name        card-name
                             :chart-description description
                             :chart-type        display
                             :data-column-names (vals field-name->display-name)
                             :chart-parameters  (mapv
                                                  (comp :parameter-name param-id->param :parameter_id)
                                                  parameter_mappings)}
                            (seq visualization_settings)
                            (assoc :chart-settings visualization_settings)))
     :global-parameters (vals param-id->param)}))

(defn describe-dashboard
  "Create a human-friendly summary of a dashboard. Returns a map of the form:
  {:description \"Some inferred description\"}"
  [dashboard-id]
  (let [dashboard-summary    (dashboard->prompt-data dashboard-id)
        summary-with-prompts (merge dashboard-summary
                                    {:description "%%FILL_THIS_DESCRIPTION_IN%%"
                                     :keywords    "%%FILL_THESE_KEYWORDS_IN%%"
                                     :questions   "%%FILL_THESE_QUESTIONS_IN%%"})
        json-str             (json/generate-string summary-with-prompts)
        client               (-> (llm-client/create-chat-completion)
                                 (llm-client/wrap-parse-json
                                   (fn [{:keys [description keywords questions]}]
                                     {:description (format "Keywords: %s\n\nDescription: %s\n\nQuestions:\n%s"
                                                           keywords
                                                           description
                                                           questions)})))]
    (client
      {:messages
       [{:role    "system"
         :content "You are a helpful assistant that summarizes dashboards I am generating for my customers by
             filling in the missing \"description\", \"keywords\", and \"questions\" keys in a json fragment."}
        {:role    "assistant"
         :content "The \"description\" key is a user friendly description of the dashboard containing up to
            two sentences. This description may not be more than 256 characters."}
        {:role    "assistant"
         :content "The \"keywords\" key is 3-5 single-quoted, comma-separated key words
            describing the dashboard (e.g. 'keyword1', 'key word'). Keywords might be used to categorize, concisely
            describe, or label the entire dashboard."}
        {:role    "assistant"
         :content "The \"questions\" key contains a markdown-formatted hyphenated list of up to 5 questions this
            dashboard might help a user answer. Each question should be on its own line."}
        {:role    "assistant"
         :content "The parts you replace are \"%%FILL_THIS_DESCRIPTION_IN%%\", \"%%FILL_THESE_KEYWORDS_IN%%\",
            and \"%%FILL_THESE_QUESTIONS_IN%%\"."}
        {:role    "assistant"
         :content "Return only a json object with the \"description\", \"keywords\", and \"questions\" fields and nothing else."}
        {:role    "user"
         :content json-str}]})))
