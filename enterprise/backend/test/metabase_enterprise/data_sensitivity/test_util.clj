(ns metabase-enterprise.data-sensitivity.test-util
  "LLM stubs for data-sensitivity tests."
  (:require
   [metabase-enterprise.data-sensitivity.llm :as llm]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.usage :as usage]
   [metabase.test :as mt]))

(defn- field-names-in-message
  "The field names rendered into a user message, in order, so a canned response can answer per chunk."
  [messages]
  (let [content (:content (last messages))]
    (mapv second (re-seq #"(?m)^- (\S+) \(" content))))

(def ^:private usage-part
  {:type :usage :usage {:promptTokens 100 :completionTokens 20 :cacheReadTokens 5 :cacheCreationTokens 0}})

(defn canned-llm
  "A stand-in for `call-llm-structured-with-trace` that answers with `(entry-fn field-name)` for every rendered
  field, dropping fields for which it returns nil."
  [entry-fn]
  (fn [_model messages _schema _temperature _max-tokens _opts]
    {:result {:fields (into [] (keep (fn [field-name]
                                       (when-let [entry (entry-fn field-name)]
                                         (merge {:name             field-name
                                                 :reasoning        "because"
                                                 :data_sensitivity "PUBLIC"
                                                 :confidence       "high"
                                                 :semantic_type    llm/no-semantic-type}
                                                entry))))
                            (field-names-in-message messages))}
     :parts  [usage-part]}))

(defn do-with-llm!
  "Run `thunk` as a superuser with `call-fn` standing in for the structured LLM call and every instance gate open."
  [call-fn thunk]
  (mt/with-dynamic-fn-redefs [metabot.self/call-llm-structured-with-trace call-fn
                              metabot.settings/metabot-enabled?           (constantly true)
                              metabot.settings/llm-metabot-configured?    (constantly true)
                              metabot.settings/llm-mini-model             (constantly "test/mini")
                              usage/check-usage-limits!                   (constantly nil)]
    (mt/with-current-user (mt/user->id :crowberto)
      (thunk))))
