(ns metabase.metabot.inference-ws-client
  (:require
    [clj-http.client :as http]
    [clojure.data.json :as json]
    [clojure.walk :as walk]
    [malli.core :as mc]
    [metabase.metabot.settings :as metabot-settings]
    [metabase.metabot.schema :as metabot-schema]
    [metabase.util.log :as log]))

(def embeddings-schema
  (mc/schema
    [:map-of :string :string]))

(def embeddings-return-schema
  (mc/schema
    [:map-of :string [:vector float?]]))

(comment
  (mc/validate embeddings-schema {"A" "esafs"})
  (mc/validate embeddings-return-schema {"A" [1.0]}))

(defn ^:dynamic call-bulk-embeddings-endpoint
  "Convert the input map of {obj-str encoding} to a map of {obj-str embedding (a vector of floats)}."
  ([endpoint obj-strs->encodings]
   (let [request {:method       :post
                  :url          (format "%s/api/bulkEmbed" endpoint)
                  :body         (json/write-str {:input obj-strs->encodings})
                  :content-type :json}
         {:keys [body status]} (http/request request)]
     (when (= 200 status)
       (get (json/read-str body) "embeddings"))))
  ([obj-strs->encoddings]
   (call-bulk-embeddings-endpoint
     (metabot-settings/metabot-inference-ws-url)
     obj-strs->encoddings)))

(comment
  (call-bulk-embeddings-endpoint {"ABC" "123"})
  )

(defn keywordize-types
  [mbql]
  (walk/postwalk (fn [x]
                   (if (and (instance? clojure.lang.MapEntry x)
                            (= (key x) :base-type))
                     [(key x) (keyword (val x))]
                     x))
                 mbql))

(defn ^:dynamic call-infer-dataset-query-endpoint
  "Infer LLM output from a provided prompt and model.

  The prompt is the user prompt and the context is a machine-generated
  description of the data to be used when performing inferencing. Ideally, this
  data will be a single dataset (model or table), but multiple datasets can be
  provided. In this latter case, the expectation is that the LLM will know how
  to select the best single dataset if it doesn't know how to do joins or that
  it will select and join as desired from the provided datasets to provide the
  final answer."
  ([endpoint {:keys [user_prompt model] :as args}]
   {:pre [user_prompt (mc/validate metabot-schema/inference-schema args)]}
   (let [request-body {:user_prompt user_prompt :model model}
         _ (clojure.pprint/pprint request-body)
         url          (format "%s/api/inferDatasetQuery" endpoint)
         _            (log/infof "Inferring mbql for prompt '%s' at %s" user_prompt url)
         request      (cond->
                        {:method       :post
                         :url          url
                         :body         (json/write-str request-body)
                         :as           :json
                         :content-type :json}
                        (and
                          (metabot-settings/openai-api-key)
                          (metabot-settings/openai-organization))
                        (assoc :headers {:openai-api-key      (metabot-settings/openai-api-key)
                                         :openai-organization (metabot-settings/openai-organization)}))
         {:keys [body status]} (http/request request)]
     (when (= 200 status)
       (keywordize-types body))))
  ([prompt-data]
   (call-infer-dataset-query-endpoint
     (metabot-settings/metabot-inference-ws-url)
     prompt-data)))
