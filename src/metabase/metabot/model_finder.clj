(ns metabase.metabot.model-finder
  (:require [clojure.string :as str]
            [metabase.metabot.client :as metabot-client]))

(defn- card->column-names
  "Generate a string of the format 'Table named '%model-id%' has title '%model-name%' and columns 'a', 'b''
  Note that for model selection, we care about the model id, not the name.
  The name is only there for user search (e.g. \"show me data in the X table\" references the name,
  but we only care about returning the ID, which is trivial to regex out.
  The bot will assuredly munge your model name)."
  [{model-name :name :keys [id result_metadata] :as _model}]
  (format
   "Table named '%s' has title '%s' and columns %s."
   id
   model-name
   (->> (map :display_name result_metadata)
        (map (partial format "'%s'"))
        (str/join ","))))

(defn- prepare-model-finder-input
  "Given a seq of models, produce input to the bot for best model discovery.
  The goal is for the bot to return a message with the numeric model id in it.
  The actual model name is put in the data to cross-reference if the prompt references it,
  but we actually want the model id returned."
  [models prompt]
  (let [model-options (str/join "," (map (fn [{:keys [id]}] (format "'%s'" id)) models))
        descs         (map (fn [s] {:role "assistant" :content s}) (map card->column-names models))
        user-prompt   (format "Which table would be most appropriate if I am trying to '%s'" prompt)]
    (conj
     (into
      [{:role "system" :content "You are a helpful assistant. Tell me which table name is the best fit for my question."}
       {:role "assistant" :content (format "My table names are %s" model-options)}]
      descs)
     {:role "user" :content user-prompt})))

(defn- find-table-id [message candidates]
  (when message
    (let [discovered (map parse-long (re-seq #"\d+" message))]
      (first (filter candidates discovered)))))

(defn infer-model
  "Find the model in the db that best matches the prompt. Return nil if no good model found."
  [{:keys [models] :as _denormalized-database} prompt]
  (let [model-input   (prepare-model-finder-input models prompt)
        best-model-id (metabot-client/invoke-metabot model-input #(find-table-id % (set (map :id models))))]
    (some (fn [{model-id :id :as model}] (when (= model-id best-model-id) model)) models)))
