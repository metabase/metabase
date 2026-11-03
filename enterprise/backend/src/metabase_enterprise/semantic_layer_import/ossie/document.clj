(ns metabase-enterprise.semantic-layer-import.ossie.document
  "Malli schemas for an Apache Ossie semantic model document, and [[read-document]], which reads one from a YAML or JSON
  file into the one shape the parser reads (`::model`).

  Two shapes of document are in use, and both are read:

  * **0.1.1**, the released spec (OSI, Open Semantic Interchange, before the project's move to Apache): the document
    wraps its models in a `semantic_model` array, next to `dialects` and `vendors` enumerations. It is what dbt 1.12
    writes as `target/osi_document.json` and the only shape Snowflake's semantic views export and import.
  * **0.2.0.dev0**, the draft on apache/ossie `main`: the model's own keys sit at the root of the document, next to
    `version`, and a dataset may carry `metrics` of its own (dataset-scoped metrics, whose expressions name the
    dataset's fields unqualified) beside the model-scoped `metrics` whose expressions name fields as `dataset.field`.
    It is what the Apache converters and Hex read.

  The schemas describe the *input*: they cover the keys the import reads, and leave the rest alone (every map is
  `::mr/deliberately-open`), so a document with an `ai_context` of any shape, `custom_extensions` or a vendor's own
  keys passes through. A key that may be absent is optional, and the parser reads an absent key as `null`. Where the
  two shapes agree they share a schema. A document's `version` picks the shape, and a version that is neither is
  refused up front rather than failing key by key; a document with no `version` is read by its shape, since
  hand-written files leave it out.

  Decoding coerces what YAML types for us: an unquoted `description: 1.5` is a float to YAML and a string to the
  spec, so text-valued keys take a number or a boolean and read it as its text. Enum-valued keys (`datatype`) are kept
  as strings and read leniently by the parser, since the draft spec still adds to them.

  References:

  * https://github.com/apache/ossie/blob/main/core-spec/spec.md and `core-spec/ossie-schema.json` (0.2.0.dev0)
  * https://github.com/apache/ossie/blob/osi-0.1.1-rc1/core-spec/spec.md and `core-spec/osi-schema.json` (0.1.1)"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.error :as me]
   [malli.transform :as mtx]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.yaml :as yaml])
  (:import
   (clojure.lang ExceptionInfo)))

(def versions
  "The `version` strings of the two document shapes the import reads, see the namespace docstring."
  #{"0.1.1" "0.2.0.dev0"})

(mr/def ::text
  "A text-valued key: a string, or a number or boolean YAML typed for us, read as its text."
  [:string {:decode/ossie (fn [x]
                            (if (or (number? x) (boolean? x))
                              (str x)
                              x))}])

(mr/def ::dialect-expression
  "One entry of an `expression`'s `dialects`: the expression in one dialect. `dialect` is a free-form string in
  0.2.0.dev0 (`ANSI_SQL`, `OSSIE_SQL_2026`, `SNOWFLAKE`, ...) and an enumeration in 0.1.1; see
  [[metabase-enterprise.semantic-layer-import.ossie.dialect]] for how one is chosen."
  [:map {::mr/deliberately-open true}
   [:dialect    ::text]
   [:expression ::text]])

(mr/def ::expression
  "A field's or metric's `expression`: the expression in one or more dialects, and in 0.2.0.dev0 optionally the
  portable `OSSIE_SQL_2026` form as `sql`, which is authoritative over an `OSSIE_SQL_2026` entry in `dialects`. At
  least one of the two has to be there."
  [:and
   [:map {::mr/deliberately-open true}
    [:sql      {:optional true} [:maybe ::text]]
    [:dialects {:optional true} [:maybe [:sequential ::dialect-expression]]]]
   [:fn {:error/message "an expression has a `sql` or at least one entry in `dialects`"}
    (fn [{:keys [sql dialects]}]
      (boolean (or sql (seq dialects))))]])

(mr/def ::dimension
  "A field's `dimension`: the field is a dimension, a time one when `is_time` is true. 0.2.0.dev0 defaults `is_time`
  from the field's `datatype` when it is left out (see [[metabase-enterprise.semantic-layer-import.ossie.parse]])."
  [:map {::mr/deliberately-open true}
   [:is_time {:optional true} [:maybe :boolean]]])

(mr/def ::field
  "A dataset's field: a row-level attribute named `name`, defined by `expression` over the columns of the dataset's
  `source`. With a `dimension` it is something a metric can be broken out by; without one it is a measure or any other
  computed value a metric's expression refers to. `datatype` is the logical type of 0.2.0.dev0 (`String`, `Integer`,
  `Decimal`, `Float`, `Boolean`, `Date`, `Time`, `DateTime`, `DateTimeTz`, `Opaque`), kept as a string since a writer
  may use another name; 0.1.1 has none."
  [:map {::mr/deliberately-open true}
   [:name        ::text]
   [:expression  ::expression]
   [:dimension   {:optional true} [:maybe ::dimension]]
   [:label       {:optional true} [:maybe ::text]]
   [:description {:optional true} [:maybe ::text]]
   [:datatype    {:optional true} [:maybe ::text]]])

(mr/def ::free-form
  "A value the import carries but never reads: a metric's `ai_context` or `custom_extensions`, of whatever shape the
  project gives it."
  [:any {::mr/deliberately-open true, :description "free-form metadata of the project's own"}])

(mr/def ::metric
  "A metric: a SQL aggregate expression, in one or more dialects, over a dataset's fields. A model-scoped metric
  (the model's `metrics`) names fields as `dataset.field` and may span datasets; a dataset-scoped one (a dataset's
  `metrics`, 0.2.0.dev0 only) names its own dataset's fields unqualified. Its `datatype`, `ai_context` and
  `custom_extensions` are carried in the IR's `meta`, unread."
  [:map {::mr/deliberately-open true}
   [:name              ::text]
   [:expression        ::expression]
   [:description       {:optional true} [:maybe ::text]]
   [:datatype          {:optional true} [:maybe ::text]]
   [:ai_context        {:optional true} ::free-form]
   [:custom_extensions {:optional true} ::free-form]])

(mr/def ::relationship
  "A many-to-one relationship from the dataset `from` to the dataset `to`, on the fields `from_columns` of the one
  and `to_columns` of the other, pairwise; more than one pair is a composite key. Despite their names the two hold
  field names (0.2.0.dev0 says so; 0.1.1 did not say, and its writers use the same names for both)."
  [:map {::mr/deliberately-open true}
   [:name         ::text]
   [:from         ::text]
   [:to           ::text]
   [:from_columns [:sequential {:min 1} ::text]]
   [:to_columns   [:sequential {:min 1} ::text]]])

(mr/def ::dataset
  "A dataset: a physical table, view or query (`source`) with the fields declared over it, its keys by field name,
  and in 0.2.0.dev0 its own metrics."
  [:map {::mr/deliberately-open true}
   [:name        ::text]
   [:source      ::text]
   [:primary_key {:optional true} [:maybe [:sequential ::text]]]
   [:unique_keys {:optional true} [:maybe [:sequential [:sequential ::text]]]]
   [:description {:optional true} [:maybe ::text]]
   [:fields      {:optional true} [:maybe [:sequential ::field]]]
   [:metrics     {:optional true} [:maybe [:sequential ::metric]]]])

(mr/def ::model-keys
  "What a semantic model holds, in either shape: at the root of a 0.2.0.dev0 document, in each entry of a 0.1.1
  document's `semantic_model`. A model's own `description` and `ai_context` are not read: the collection the metrics
  land in has a fixed description."
  [:map {::mr/deliberately-open true}
   [:name          ::text]
   [:datasets      [:sequential {:min 1} ::dataset]]
   [:relationships {:optional true} [:maybe [:sequential ::relationship]]]
   [:metrics       {:optional true} [:maybe [:sequential ::metric]]]])

(mr/def ::document.0.1.1
  "A 0.1.1 document: the models in `semantic_model`, which the import reads one of (see [[model]])."
  [:map {::mr/deliberately-open true}
   [:version        {:optional true} [:maybe [:= "0.1.1"]]]
   [:semantic_model [:sequential ::model-keys]]])

(mr/def ::document.0.2.0
  "A 0.2.0.dev0 document: one model, at the root."
  [:merge
   ::model-keys
   [:map {::mr/deliberately-open true}
    [:version {:optional true} [:maybe [:= "0.2.0.dev0"]]]]])

(mr/def ::model
  "The one shape the parser reads, whichever the document's: the model's keys (see `::model-keys`) and the document's
  `version`, nil when it had none."
  [:merge
   ::model-keys
   [:map {::mr/deliberately-open true}
    [:version [:maybe :string]]]])

(mr/def ::raw
  "A document as YAML or JSON parses it, with keyword keys (YAML leaves a key that is not text as it is), before
  decoding: a map of any shape, which decoding checks."
  [:map-of {::mr/deliberately-open true, :description "the raw document, of any shape"} :any :any])

(def ^:private transformer
  (mtx/transformer
   {:name :ossie}
   mtx/json-transformer))

(mu/defn- document-version :- [:maybe :string]
  "The shape `document` is read in: its `version` when it has one; otherwise 0.1.1 when it has a `semantic_model`
  and 0.2.0.dev0 when it has `datasets`, so that a hand-written document without a version is read by its shape.
  Nil when neither says."
  [{:keys [version] :as document} :- ::raw]
  (cond
    (some? version)                      (str version)
    (contains? document :semantic_model) "0.1.1"
    (contains? document :datasets)       "0.2.0.dev0"))

(mu/defn- decode :- ::raw
  "`document` decoded against `schema` (see [[transformer]]), or thrown as `Invalid Ossie document` with the
  humanized explanation."
  [schema   :- :keyword
   document :- ::raw]
  ;; the decoder is cached under a namespaced key and rebuilt only when a schema is defined again with [[mr/def]]
  (let [decoder (mr/cached [::decoder schema] schema (fn [] (mc/decoder schema transformer)))
        decoded (decoder document)]
    (if-let [error (mr/explain schema decoded)]
      (throw (ex-info "Invalid Ossie document" {:errors (me/humanize error)}))
      decoded)))

(mu/defn model :- ::model
  "The one model `document`, a document as YAML or JSON parses it with keyword keys, holds, in the shape the parser
  reads. Throws `Unsupported Ossie document` for a `version` the import does not read, `Invalid Ossie document`
  with the humanized explanation when the document does not match its version's schema, and a 0.1.1 document that
  holds no model or more than one is refused too: the import reads one semantic model per document, as 0.2.0.dev0
  requires, and a 0.1.1 document with several has to be split."
  [document :- ::raw]
  (let [version (document-version document)]
    (when-not (contains? versions version)
      (throw (ex-info (format (str "Unsupported Ossie document: the import reads documents of version %s, this one"
                                   " says %s")
                              (str/join " or " (sort versions)) (pr-str version))
                      {:version version})))
    (case version
      "0.1.1"
      (let [{models :semantic_model} (decode ::document.0.1.1 document)]
        (when-not (= 1 (count models))
          (throw (ex-info (format (str "Invalid Ossie document: the import reads one semantic model per document, and"
                                       " semantic_model holds %d (%s); split the document, one model each")
                                  (count models) (str/join ", " (map (comp pr-str :name) models)))
                          {:models (mapv :name models)})))
        (assoc (first models) :version version))

      "0.2.0.dev0"
      (assoc (decode ::document.0.2.0 document) :version version))))

(def ^:private yaml-nesting-depth-limit
  "How deep a YAML document may nest: an Ossie document nests six levels or so, and a document thousands deep would
  overflow the stack before the shared default of [[yaml/nesting-depth-limit]] is reached."
  100)

(mu/defn- parse-file :- [:any {::mr/deliberately-open true, :description "the parsed file, of any shape"}]
  "The YAML or JSON of the file at `filename`, parsed with keyword keys, whatever its shape: JSON when the name ends in
  `.json`, YAML otherwise (JSON is YAML too, so a `.json` file read as YAML parses as well; the split is about the error
  messages). A YAML mapping with a key twice is refused rather than read as its last value, and so is one nested deeper
  than [[yaml-nesting-depth-limit]]. Throws, naming the file, when it cannot be read or does not parse."
  [filename :- :string]
  (try
    (if (str/ends-with? (u/lower-case-en filename) ".json")
      (with-open [r (io/reader filename)]
        (json/decode+kw r))
      (yaml/parse-string (slurp filename)
                         :allow-duplicate-keys false
                         :nesting-depth-limit yaml-nesting-depth-limit))
    (catch Exception e
      (throw (ex-info (format "Cannot read Ossie document %s: %s" filename (ex-message e))
                      {:path filename}
                      e)))))

(mu/defn read-document :- ::model
  "Read the Ossie document at `filename`, YAML (`.yaml`, `.yml`) or JSON (`.json`), into the one [[model]] it holds.
  Every failure names the file and carries its `:path` in the exception's data: a file that cannot be read or does not
  parse, one that holds no mapping (an empty file parses to nothing), one of a version the import does not read, and
  one that does not match its version's schema."
  [filename :- :string]
  (let [raw (parse-file filename)]
    (when-not (map? raw)
      (throw (ex-info (format "Invalid Ossie document %s: %s" filename
                              (cond
                                (nil? raw)        "the file is empty"
                                (sequential? raw) "the file holds a list, not a mapping"
                                :else             "the file holds a value that is not a mapping"))
                      {:path filename})))
    (try
      (model raw)
      (catch ExceptionInfo e
        (throw (ex-info (format "%s (%s)" (ex-message e) filename)
                        (assoc (ex-data e) :path filename)
                        e))))))
