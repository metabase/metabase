(ns metabase.metabot.self.google.models
  "The Gemini model catalog for the Google provider, and the predicates derived from it.

  One catalog serves both halves of the adapter: [[metabase.metabot.self.google]] answers context
  windows and the settings reasoning gate from it, and
  [[metabase.metabot.self.google.stream-generate-content]] builds the thinking directive from it,
  so the gate and the request body cannot disagree.")

(def catalog
  "The Gemini models Metabot supports, with what the adapter needs to know about each.

  The same three models the connection form offers (the google entry in `metabase.llm.provider`);
  a test pins the two lists together. All are Gemini 3 models: they think by default and thinking
  cannot be turned off, so [[reasoning-model?]] is membership in this catalog.
  https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking
  Context windows:
  - https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash
  - https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-6-flash
  - https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-7-flash"
  {"google/gemini-3.5-flash" {:context-window 1048576}
   "google/gemini-3.6-flash" {:context-window 1048576}
   "google/gemini-3.7-flash" {:context-window 1048576}})

(defn reasoning-model?
  "Whether `model` streams thought summaries that our chain-of-thought UI renders.

  True exactly for the [[catalog]] models. Off-catalog models get no thinking directive and the
  settings gate answers false for them, as with the other whitelisted providers."
  [model]
  (contains? catalog (str model)))
