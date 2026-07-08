(ns metabase.metabot.provider-util
  "Utility functions for parsing `provider-and-model` strings.

  These strings have the format `provider/model` (e.g. `anthropic/claude-haiku-4-5`,
  `openrouter/anthropic/claude-haiku-4-5`) or `metabase/provider/model` when routed
  through the Metabase Cloud AI proxy."
  (:require
   [clojure.string :as str]))

(def metabase-provider-prefix
  "The provider prefix that signals requests should be routed through the
  Metabase Cloud AI proxy."
  "metabase")

(defn metabase-provider?
  "Returns true when the provider-and-model string uses the Metabase AI proxy
  (i.e. starts with `metabase/`)."
  [provider-and-model]
  (boolean (some-> provider-and-model (str/starts-with? (str metabase-provider-prefix "/")))))

(defn provider-and-model->outer-provider
  "Extract the top-level provider prefix from a provider-and-model string.
  For `metabase/anthropic/model` returns `\"metabase\"`.
  For `anthropic/model` returns `\"anthropic\"`."
  [provider-and-model]
  (when provider-and-model
    (first (str/split provider-and-model #"/" 2))))

(defn provider-and-model->provider
  "Extract the direct provider from a provider-and-model string.
  For `metabase/anthropic/model` returns `\"anthropic\"`.
  For `anthropic/model` returns `\"anthropic\"`."
  [provider-and-model]
  (when provider-and-model
    (let [[first-seg rest-seg] (str/split provider-and-model #"/" 2)]
      (if (= first-seg metabase-provider-prefix)
        (first (str/split rest-seg #"/" 2))
        first-seg))))

(defn provider-and-model->model
  "Extract the model name from a provider-and-model string.
  For `metabase/anthropic/model` returns `\"model\"`.
  For `anthropic/model` returns `\"model\"`.
  For `openrouter/anthropic/claude-haiku-4-5` returns `\"anthropic/claude-haiku-4-5\"`."
  [provider-and-model]
  (when provider-and-model
    (let [[first-seg rest-seg] (str/split provider-and-model #"/" 2)]
      (if (= first-seg metabase-provider-prefix)
        (second (str/split rest-seg #"/" 2))
        rest-seg))))

(defn strip-metabase-prefix
  "Strip the `metabase/` routing prefix from a provider-and-model string.
  For `metabase/openrouter/anthropic/claude-haiku-4-5` returns
  `\"openrouter/anthropic/claude-haiku-4-5\"`.
  Returns the input unchanged if no prefix is present."
  [provider-and-model]
  (if (metabase-provider? provider-and-model)
    (str/replace-first provider-and-model (str metabase-provider-prefix "/") "")
    provider-and-model))
