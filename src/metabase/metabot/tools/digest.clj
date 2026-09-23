(ns metabase.metabot.tools.digest
  "The `render_digest` tool: how the `:digest` profile emits a digest as structured data rather than prose.

  The division of labour is deliberate, and the schema enforces it. The server chooses which items appear — see
  [[metabase.metabot.digest.signals/digest-selection]] — and supplies every fact the page renders: entity name,
  model, id, signals. The model contributes only prose: a one-line `summary` and one `reason` per item.

  So a model that misremembers a name, invents an id, or decides it would rather feature something else cannot
  change what the page shows. At worst an item renders with no reason under it."
  (:require
   [metabase.api.common :as api]
   [metabase.metabot.digest.signals :as digest.signals]
   [metabase.metabot.scope :as scope]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private item-reason-schema
  [:map {:closed true}
   [:model [:enum "card" "dashboard" "table" "collection" "document"]]
   [:id ms/PositiveInt]
   [:reason ms/NonBlankString]])

(def ^:private render-digest-schema
  [:map {:closed true}
   [:summary {:optional true} [:maybe :string]]
   [:reasons [:sequential item-reason-schema]]])

(defn- reason-index
  "Map of `[model id]` -> reason text from the model's call."
  [reasons]
  (into {}
        (map (juxt (fn [{:keys [model id]}] [(keyword model) id]) :reason))
        reasons))

(defn- render-item
  [reasons {:keys [model id name description card-type] :as item}]
  {:model       (clojure.core/name model)
   :id          id
   :name        name
   :description description
   :card_type   card-type
   :reason      (get reasons [model id])
   :signals     (into [] (comp (map (comp clojure.core/name :signal)) (distinct)) (:reasons item))})

(mu/defn ^{:tool-name "render_digest"
           :scope     scope/agent-content-read}
  render-digest-tool
  "Render the user's digest. Call this exactly once, as your final action, instead of writing the digest as prose.

   You do not choose what appears — the items are already selected and listed for you. Pass one `reason` for each
   of them: a single sentence, in the user's own terms, saying why it matters to them. Identify each by the
   `model` and `id` from the item list. `summary` is an optional one-line opener for the whole digest.

   An item you leave out still appears, just without a reason, so cover all of them."
  [{:keys [summary reasons]} :- render-digest-schema]
  (let [items     (digest.signals/digest-selection api/*current-user-id*)
        index     (reason-index reasons)
        rendered  (mapv (partial render-item index) items)
        unmatched (remove (fn [[k _]] (some #(= k [(:model %) (:id %)]) items)) index)
        missing   (count (remove :reason rendered))]
    (when (seq unmatched)
      (log/warnf "render_digest: %d reason(s) named entities outside the selection" (count unmatched)))
    (when (pos? missing)
      (log/warnf "render_digest: %d selected item(s) got no reason" missing))
    {:output            (format "Rendered a digest of %d item(s)%s."
                                (count rendered)
                                (if (pos? missing) (format ", %d without a reason" missing) ""))
     :structured-output {:result-type :digest
                         :summary     summary
                         :items       rendered}}))
