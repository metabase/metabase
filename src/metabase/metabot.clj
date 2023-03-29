(ns metabase.metabot
  (:require
   [clojure.string :as str]
   [metabase.metabot.client :as metabot-client]
   [metabase.metabot.model-finder :as model-finder]
   [metabase.metabot.sql-generator :as sql-generator]
   [wkok.openai-clojure.api :as openai.api]))

(defn infer-sql [model question]
  (cond
    (false? (metabot-client/is-metabot-enabled)) nil
    (metabot-client/openai-sql-inference-webhook) (metabot-client/infer-sql model question)
    :else (sql-generator/infer-sql model question)))

(defn infer-model [database question]
  (cond
    (false? (metabot-client/is-metabot-enabled)) nil
    (metabot-client/openai-model-inference-webhook) (metabot-client/infer-model database question)
    :else (model-finder/infer-model database question)))

(defn openai-models []
  (let [models (->> (openai.api/list-models
                     {:api-key      (metabot-client/openai-api-key)
                      :organization (metabot-client/openai-organization)})
                    :data
                    (map #(select-keys % [:id :owned_by]))
                    (sort-by :id))]
    {:models      models
     :recommended (->> models
                       ;; Keep only GPTs
                       (filter (comp #(str/starts-with? % "gpt-") :id))
                       ;; Split up into name components
                       (map (juxt (comp #(str/split % #"\-") :id) :id))
                       ;; The version is the second value (v) and longer versions are older variants
                       ;; We want the highest version and the "release" version (no variant block, so shorter)
                       (sort-by (fn [[[_ version :as v]]] [(parse-double version) (- (count v))]))
                       ;; Extract the value we detected
                       last
                       last)}))
