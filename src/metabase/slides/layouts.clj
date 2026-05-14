(ns metabase.slides.layouts
  "Slide layout catalog. Each layout has:
   - a Malli schema validating the slide's `data` payload
   - a human-readable description fed to the LLM so it knows what to emit
   - a JSON-Schema rendering of the data shape (also for the LLM)

   The agent's `write_slide` tool accepts {:layout :data} and dispatches on
   `layout`. The frontend has one dedicated React component per layout that
   takes the `data` map and renders a polished slide.")

;;; -------------------------------------------- Schema fragments -----------------------------------------------

(def ^:private bullet-string
  [:string {:min 1 :max 140}])

(def ^:private title
  [:string {:min 1 :max 100}])

(def ^:private optional-string
  [:maybe [:string {:max 200}]])

(def ^:private metric-cell
  [:map
   [:value [:string {:min 1 :max 12}]]
   [:label [:string {:min 1 :max 32}]]
   [:subtext {:optional true} optional-string]
   [:card_id {:optional true} [:maybe :int]]])

;;; ------------------------------------------------ Catalog ----------------------------------------------------

(def catalog
  "Map of layout-id (string) → {:schema malli :description str :tool-description str}.

   `:schema` is enforced at write_slide time. `:tool-description` is what we show
   Claude inside the `write_slide` tool docs so it knows what to put in `data`."
  {"cover"
   {:description "Opening slide. Large gradient background, oversized headline."
    :tool-description
    (str "Cover slide. Data:\n"
         "  title (string, 1-100) — the deck headline\n"
         "  subtitle (optional string, ≤200) — supporting line below the headline\n"
         "  accent (optional enum 'violet'|'sunset'|'ocean'|'forest', default 'violet') — colour palette")
    :schema
    [:map
     [:title title]
     [:subtitle {:optional true} optional-string]
     [:accent {:optional true} [:enum "violet" "sunset" "ocean" "forest"]]]}

   "bullets"
   {:description "Heading + 2-5 short bullet points. Pure text."
    :tool-description
    (str "Bullets slide. Data:\n"
         "  title (string, 1-100)\n"
         "  bullets (array of 2-5 strings, each ≤140 chars)\n"
         "  eyebrow (optional small uppercase label above the title, ≤32 chars)")
    :schema
    [:map
     [:title title]
     [:bullets [:vector {:min 2 :max 5} bullet-string]]
     [:eyebrow {:optional true} [:maybe [:string {:max 32}]]]]}

   "chart_hero"
   {:description "Heading at the top + a live Metabase chart that fills the rest of the slide. Use for the most important data point."
    :tool-description
    (str "Single full-bleed Metabase chart. Data:\n"
         "  title (string)\n"
         "  card_id (integer) — the Metabase card to embed (must come from a tool call you've made)\n"
         "  caption (optional, one-line takeaway below the chart, ≤200 chars)")
    :schema
    [:map
     [:title title]
     [:card_id :int]
     [:caption {:optional true} optional-string]]}

   "metrics_grid"
   {:description "Grid of 2-6 hero metrics. Each metric is a giant value + label. Use for KPI rollups."
    :tool-description
    (str "Grid of 2-6 KPI cards. Data:\n"
         "  title (string)\n"
         "  metrics (array of 2-6) — each:\n"
         "    value (string, ≤12 chars, e.g. '$1.2M', '+18%', '4.6/5')\n"
         "    label (string, ≤32 chars)\n"
         "    subtext (optional, ≤200) — small caption (eg 'last 30 days')\n"
         "    card_id (optional integer) — embed a Metabase card behind the value instead of using a static value")
    :schema
    [:map
     [:title title]
     [:metrics [:vector {:min 2 :max 6} metric-cell]]]}

   "title_metrics_with_chart"
   {:description "60/40 split — big chart on the left, vertical metric sidebar on the right. The most 'Gamma' layout."
    :tool-description
    (str "Two-column: chart left + metrics sidebar right. Data:\n"
         "  title (string)\n"
         "  description (optional, ≤200) — supporting paragraph under the title\n"
         "  card_id (integer) — chart to render in the left column\n"
         "  metrics (array of 2-5) — each {value, label}")
    :schema
    [:map
     [:title title]
     [:description {:optional true} optional-string]
     [:card_id :int]
     [:metrics [:vector {:min 2 :max 5} metric-cell]]]}

   "two_column"
   {:description "Heading + bullets on the left, a Metabase chart on the right. Use when the bullets need a chart for evidence."
    :tool-description
    (str "Two column with bullets+chart. Data:\n"
         "  title (string)\n"
         "  bullets (array of 2-5 strings)\n"
         "  card_id (integer) — chart for the right column")
    :schema
    [:map
     [:title title]
     [:bullets [:vector {:min 2 :max 5} bullet-string]]
     [:card_id :int]]}

   "big_quote"
   {:description "A pull quote slide. Use for striking single-line insights."
    :tool-description
    (str "A single oversized quote. Data:\n"
         "  quote (string, 8-200 chars)\n"
         "  attribution (optional, ≤80) — who said it / source")
    :schema
    [:map
     [:quote [:string {:min 8 :max 200}]]
     [:attribution {:optional true} [:maybe [:string {:max 80}]]]]}

   "closing"
   {:description "Final slide. Dark gradient, brief wrap-up or call-to-action."
    :tool-description
    (str "Closing slide. Data:\n"
         "  title (string)\n"
         "  subtitle (optional)")
    :schema
    [:map
     [:title title]
     [:subtitle {:optional true} optional-string]]}})

(def layout-ids
  "Vector of all valid layout ids, in a sensible default order for the LLM."
  ["cover"
   "metrics_grid"
   "title_metrics_with_chart"
   "chart_hero"
   "two_column"
   "bullets"
   "big_quote"
   "closing"])

(def Slide
  "Malli schema for a single stored slide."
  [:map
   [:id :string]
   [:layout (into [:enum] layout-ids)]
   [:data :any]])

(def SlidesArray
  [:vector {:min 1} Slide])

(defn schema-for
  "Get the data-schema for a layout, or nil if unknown."
  [layout]
  (get-in catalog [layout :schema]))

(defn layouts-help
  "A multi-line string describing every available layout for the LLM, used inside
   the `write_slide` tool description."
  []
  (clojure.string/join
   "\n\n"
   (for [id layout-ids
         :let [c (get catalog id)]]
     (str "── " id " ──\n"
          (:description c) "\n"
          (:tool-description c)))))
