(ns metabase.metabot
  "The core metabot namespace. Consists primarily of functions named infer-X,
  where X is the thing we want to extract from the bot response."
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [metabase.lib.native :as lib-native]
   [metabase.metabot.client :as metabot-client]
   [metabase.metabot.settings :as metabot-settings]
   [metabase.metabot.util :as metabot-util]
   [metabase.util.log :as log]))

(defn viz-prompt [sql]
  (tap> {:sql sql})
  [{:role    "system"
    :content "You are a helpful assistant. Write a json document summarizing how I can present my data."}
   {:role    "assistant"
    :content "This is a json document that is a template for each visualization type:"}
   {:role    "assistant"
    :content (json/generate-string
              {:chart-templates
               (mapv
                #(assoc % :description "%%CHART_TITLE%%")
                [{:display                :table
                  :visualization_settings {}
                  :description            "A tabular display of data. Best for when you have many columns or no other chart is a good match."}
                 {:display                :line
                  :visualization_settings {:x-axis "%%SELECT_ONE%%" :y-axis ["%%SELECT_N%%"]}
                  :description            "A line graph showing trends over time."}
                 {:display                :area
                  :visualization_settings {:x-axis "%%SELECT_ONE%%" :y-axis ["%%SELECT_N%%"]}
                  :description            "A stacked area chart good for showing groups of data over time."}
                 {:display                :bar
                  :visualization_settings {:x-axis "%%SELECT_ONE%%" :y-axis ["%%SELECT_N%%"]}
                  :description            "A bar chart used for showing segments of information by groupings."}
                 {:display                :row
                  :visualization_settings {:x-axis "%%SELECT_ONE%%" :y-axis ["%%SELECT_N%%"]}
                  :description            "Similar to a bar chart, but showing bars left to right."}
                 {:display                :combo
                  :visualization_settings {:x-axis "%%SELECT_ONE%%" :y-axis ["%%SELECT_N%%"]}
                  :description            "A combination of a line chart superimposed on top of a bar chart."}
                 {:display                :waterfall
                  :visualization_settings {:x-axis "%%SELECT_ONE%%" :y-axis ["%%SELECT_N%%"]}
                  :description            "A chart showing running totals as values increase and decrease from the initial or baseline value"}
                 {:display                :scalar
                  :visualization_settings {:y-axis "%%SELECT_N%%"}
                  :description            "A chart good for showing single values."}])}
              {:pretty true})}
   {:role    "assistant"
    :content "The description provides additional details on when you might want to use a specific chart template."}
   {:role    "assistant"
    :content (format "This is the SQL describing my data:\n%s" sql)}
   {:role    "user"
    :content (str/join
              "\n"
              ["Select and fill in the most interesting and relevant template for the data described by my SQL query."
               "The \"%%CHART_TITLE%%\" will be replaced by a concise description of the chart."
               "The \"%%SELECT_ONE%%\" values will be replaced with a single column name."
               "The \"%%SELECT_N%%\" values will be replaced with a comma separated list of one or more column names."
               "Just return the json document with no explanation."])}])

(defn response->viz [{:keys [display description visualization_settings] :as response}]
  (tap> {:response response})
  (let [display (keyword display)
        {:keys [x-axis y-axis]} visualization_settings]
    (case display
      (:line :bar :area :waterfall) {:display                display
                                     :name                   description
                                     :visualization_settings {:title            description
                                                              :graph.dimensions [x-axis]
                                                              :graph.metrics    y-axis}}
      (:scalar) {:display                display
                 :name                   description
                 :visualization_settings {:title            description
                                          :graph.metrics    y-axis
                                          :graph.dimensions []}}
      {:display                :table
       :name                   description
       :visualization_settings {:title description}})))

(defn infer-viz
  "Determine an 'interesting' visualization for this data."
  [{sql :sql :as _context}]
  (log/infof "Metabot is inferring visualization for sql '%s'." sql)
  (if (metabot-settings/is-metabot-enabled)
    (let [prompt (viz-prompt sql)]
      (metabot-util/find-result
       (fn [message]
         (json/parse-string message keyword))
       (metabot-client/invoke-metabot prompt)))
    (log/warn "Metabot is not enabled")))

(defn infer-sql
  "Given a model and prompt, attempt to generate a native dataset."
  [{:keys [model user_prompt] :as context}]
  (log/infof "Metabot is inferring sql for model '%s' with prompt '%s'." (:id model) user_prompt)
  (if (metabot-settings/is-metabot-enabled)
    (let [{:keys [prompt_template version prompt]} (metabot-util/create-prompt context)
          {:keys [database_id inner_query]} model]
      (if-some [bot-sql (metabot-util/find-result
                         metabot-util/extract-sql
                         (metabot-client/invoke-metabot prompt))]
        (let [final-sql     (metabot-util/bot-sql->final-sql model bot-sql)
              _             (log/infof "Inferred sql for model '%s' with prompt '%s':\n%s"
                                       (:id model)
                                       user_prompt
                                       final-sql)
              template-tags (lib-native/template-tags inner_query)
              template      (when-not (str/starts-with?
                                       (str/replace bot-sql #"\s+" "")
                                       "SELECT*")
                              (infer-viz (assoc context :sql bot-sql)))
              _             (tap> {:chart-templates template})
              viz           (response->viz template)
              _             (tap> {:viz viz})
              dataset       (doto
                             (merge
                              {:dataset_query          {:database database_id
                                                        :type     "native"
                                                        :native   {:query         final-sql
                                                                   :template-tags template-tags}}
                               :display                :table
                               :visualization_settings {}}
                              viz)
                              tap>)]
          {:card                     dataset
           :prompt_template_versions (vec
                                      (conj
                                       (:prompt_template_versions model)
                                       (format "%s:%s" prompt_template version)))})
        (log/infof "No sql inferred for model '%s' with prompt '%s'." (:id model) user_prompt)))
    (log/warn "Metabot is not enabled")))

(defn infer-model
  "Find the model in the db that best matches the prompt. Return nil if no good model found."
  [{{database-id :id :keys [models]} :database :keys [user_prompt] :as context}]
  (log/infof "Metabot is inferring model for database '%s' with prompt '%s'." database-id user_prompt)
  (if (metabot-settings/is-metabot-enabled)
    (let [{:keys [prompt_template version prompt]} (metabot-util/create-prompt context)
          ids->models   (zipmap (map :id models) models)
          candidates    (set (keys ids->models))
          best-model-id (metabot-util/find-result
                         (fn [message]
                           (some->> message
                                    (re-seq #"\d+")
                                    (map parse-long)
                                    (some candidates)))
                         (metabot-client/invoke-metabot prompt))]
      (if-some [model (ids->models best-model-id)]
        (do
          (log/infof "Metabot selected best model for database '%s' with prompt '%s' as '%s'."
                     database-id user_prompt best-model-id)
          (update model
                  :prompt_template_versions
                  (fnil conj [])
                  (format "%s:%s" prompt_template version)))
        (log/infof "No model inferred for database '%s' with prompt '%s'." database-id user_prompt)))
    (log/warn "Metabot is not enabled")))
