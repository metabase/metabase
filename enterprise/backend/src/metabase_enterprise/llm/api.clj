(ns metabase-enterprise.llm.api
  (:require
   [cheshire.core :as json]
   [clojure.set :refer [rename-keys]]
   [clojure.walk :as walk]
   [compojure.core :refer [GET POST]]
   [metabase-enterprise.llm.client :as llm-client]
   [metabase.api.common :as api]
   [metabase.query-processor :as qp]
   [metabase.sync.analyze.query-results :as qr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- remove-nil-vals
  "Utility function to remove nil values from a map. If all values are nil, returns nil."
  [m]
  (let [m' (reduce-kv
             (fn [acc k v]
               (cond-> acc
                 (some? v)
                 (assoc k v)))
             {}
             m)]
    (when (seq m') m')))

(defn- infer-card-summary
  "Create a human-friendly summary of a card. Returns a map of the form:
  {:summary {:title \"Some inferred title\"
             :description \"Some inferred description\"}}"
  [{:keys [display visualization_settings dataset_query result_metadata]}]
  (let [{:keys [query]} (qp/compile-and-splice-parameters dataset_query)
        visualization_settings (remove-nil-vals visualization_settings)
        description            (cond->
                                 {:sql_query           query
                                  :display_type        display
                                  :column_descriptions (zipmap
                                                         (map (some-fn :display_name :name) result_metadata)
                                                         (map (some-fn :semantic_type :effective_type) result_metadata))
                                  :friendly_title      "%%FILL_THIS_TITLE_IN%%"
                                  :friendly_summary    "%%FILL_THIS_SUMMARY_IN%%"}
                                 visualization_settings
                                 (assoc :visualization_settings visualization_settings))
        json-str               (json/generate-string description)
        client                 (-> llm-client/create-chat-completion
                                   (llm-client/wrap-parse-json
                                     (fn [rsp] (rename-keys rsp {:friendly_title   :title
                                                                 :friendly_summary :description}))))]
    {:summary
     (client
       {:messages
        [{:role    "system"
          :content "You are a helpful assistant that fills in the missing \"friendly_title\" and
                        \"friendly_summary\" keys in a json fragment. You like to occasionally use emojis to express
                        yourself but are otherwise very serious and professional."}
         {:role    "assistant"
          :content (cond-> "The \"display\" key is how I intend to present the final data."
                     (seq visualization_settings)
                     (str " The \"visualization_settings\" key has chart settings."))}
         {:role    "assistant"
          :content "The parts you replace are \"%%FILL_THIS_TITLE_IN%%\" and \"%%FILL_THIS_SUMMARY_IN%%\"."}
         {:role    "assistant"
          :content "Return only a json object with the \"friendly_title\" and \"friendly_summary\" fields and nothing else."}
         {:role    "assistant"
          :content "The \"friendly_title\" must be no more than 64 characters long."}
         {:role    "user"
          :content json-str}]})}))

(defn- dashboard-summary
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
                                                                  remove-nil-vals
                                                                  (walk/prewalk (fn [v] (field-name->display-name v v))))]]
                          {:chart-name        card-name
                           :chart-description description
                           :chart-type        display
                           :chart-settings    visualization_settings
                           :data-column-names (vals field-name->display-name)
                           :chart-parameters  (mapv
                                                (comp :parameter-name param-id->param :parameter_id)
                                                parameter_mappings)})
     :global-parameters (vals param-id->param)}))

(defn infer-dashboard-summary
  "Create a human-friendly summary of a dashboard. Returns a map of the form:
  {:summary {:description \"Some inferred description\"}}"
  [dashboard-id]
  (let [dashboard-summary    (dashboard-summary dashboard-id)
        summary-with-prompts (merge dashboard-summary
                                    {:description "%%FILL_THIS_DESCRIPTION_IN%%"
                                     :keywords    "%%FILL_THESE_KEYWORDS_IN%%"
                                     :questions   "%%FILL_THESE_QUESTIONS_IN%%"})
        json-str             (json/generate-string summary-with-prompts)
        client               (-> llm-client/create-chat-completion
                                 (llm-client/wrap-parse-json
                                   (fn [{:keys [description keywords questions]}]
                                     {:description (format "Keywords: %s\n\nDescription: %s\n\nQuestions:\n%s"
                                                           keywords
                                                           description
                                                           questions)})))]
    {:summary
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
          :content json-str}]}
       {})}))

(api/defendpoint POST "/card/summarize"
  "Summarize a question."
  [:as {{:keys [collection_id collection_position dataset dataset_query description display
                parameters parameter_mappings result_metadata visualization_settings cache_ttl]
         :as   body} :body}]
  {dataset                [:maybe :boolean]
   dataset_query          ms/Map
   parameters             [:maybe [:sequential ms/Parameter]]
   parameter_mappings     [:maybe [:sequential ms/ParameterMapping]]
   description            [:maybe ms/NonBlankString]
   display                ms/NonBlankString
   visualization_settings ms/Map
   collection_id          [:maybe ms/PositiveInt]
   collection_position    [:maybe ms/PositiveInt]
   result_metadata        [:maybe qr/ResultsMetadata]
   cache_ttl              [:maybe ms/PositiveInt]}
  ;; check that we have permissions to run the query that we're trying to save
  ;(check-data-permissions-for-query dataset_query)
  (infer-card-summary body))

(api/defendpoint GET "/dashboard/summarize/:id"
  "Get Dashboard with ID."
  [id]
  {id ms/PositiveInt}
  (infer-dashboard-summary id))

(api/define-routes)
