(ns metabase-enterprise.semantic-layer-import.core
  "Import a semantic layer into Metabase as serdes YAML that `import` loads.

  [[convert!]] runs the whole import in one call, the same way for every source:

  1. parse: the source's [[interface/raw->ir]] (dbt's is in [[metabase-enterprise.semantic-layer-import.dbt.core]])
     turns the semantic layer as the source writes it into the intermediate representation of
     [[metabase-enterprise.semantic-layer-import.schemas.ir]], which stays in memory;
  2. [[check-driver]]: the config's driver against the warehouse the project was written for;
  3. resolve ([[metabase-enterprise.semantic-layer-import.resolve]]): bind the IR's content to Lib queries against a
     metadata provider made from it, reporting what has no Metabase equivalent;
  4. emit ([[metabase-enterprise.semantic-layer-import.emit]]): turn what resolved into serdes entities in one
     collection and write them.

  [[preflight]] then checks the tree against the instance it is going to be imported into.

  Metrics are the content an import carries today. Another kind of content is a key of the IR, a resolver, an
  emitter, and an entry kind of the report here (see `::converted`)."
  (:require
   [metabase-enterprise.semantic-layer-import.emit :as emit]
   [metabase-enterprise.semantic-layer-import.interface :as interface]
   [metabase-enterprise.semantic-layer-import.preflight :as preflight]
   [metabase-enterprise.semantic-layer-import.resolve :as resolve]
   [metabase-enterprise.semantic-layer-import.schemas.config :as config]
   [metabase-enterprise.semantic-layer-import.schemas.ir :as ir]
   [metabase-enterprise.semantic-layer-import.schemas.resolved :as resolved]
   [metabase.classloader.core :as classloader]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(def ^:private source-namespaces
  "The namespace that implements [[interface/raw->ir]] for each source, by its `:type`. [[convert!]] loads a source's
  namespace the first time it converts something of that source's, rather than loading every source up front."
  {:dbt 'metabase-enterprise.semantic-layer-import.dbt.core})

(mu/defn check-driver :- :nil
  "Check the config's `driver` against `warehouse`, what the semantic layer says about the warehouse it was written
  for. The driver decides the type map the column types go through and the dialect the SQL is parsed in, so a driver
  that disagrees with the project would silently give wrong base types and misread SQL. Throws when the source maps
  the warehouse to another driver. Logs a warning, and lets the config stand, when the semantic layer names no
  warehouse or one the source knows no Metabase driver for, since there is nothing to check against."
  [driver                                   :- :keyword
   {warehouse-type :type, expected :driver} :- ::ir/warehouse]
  (cond
    (nil? warehouse-type)
    (log/warnf "The semantic layer names no warehouse; taking the config's :driver %s at its word" driver)

    (nil? expected)
    (log/warnf "No Metabase driver is known for the warehouse %s; taking the config's :driver %s at its word"
               (pr-str warehouse-type) driver)

    (not= expected driver)
    (throw (ex-info (format (str "The semantic layer was written for the warehouse %s, which Metabase connects to with"
                                 " the %s driver, but the config's :driver is %s: the column types and the SQL would"
                                 " be read as another warehouse's")
                            (pr-str warehouse-type) expected driver)
                    {:warehouse-type  warehouse-type
                     :expected-driver expected
                     :driver          driver}))))

(mr/def ::converted.metric
  "A metric the run converted: its name, the card's `entity_id`, the file it was written to, its notes (where it
  agrees with the source only under some conditions, see
  [[metabase-enterprise.semantic-layer-import.resolve.metrics/notes]]) and the dimensions it could not give the
  metric."
  [:map {:closed true}
   [:kind                   [:= :metric]]
   [:name                   :string]
   [:entity-id              ms/NanoIdString]
   [:path                   :string]
   [:notes                  [:sequential :string]]
   [:unsupported-dimensions [:sequential ::resolved/unsupported-dimension]]])

(mr/def ::converted
  "Something the run converted, by kind."
  [:multi {:dispatch :kind}
   [:metric ::converted.metric]])

(mr/def ::report
  "What a run converted, with the file each entry was written to; what it could not convert, with the reason; and
  what the import itself failed on, naming the exception. Every entry says what `kind` of content it is about."
  [:map {:closed true}
   [:out-dir     :string]
   [:converted   [:sequential ::converted]]
   [:unsupported [:sequential [:map {:closed true}
                               [:kind   ::ir/content-kind]
                               [:name   :string]
                               [:reason :string]]]]
   [:errors      [:sequential ::resolved/error]]])

(mu/defn- converted :- ::converted
  "The report entry for `file`, one of the content files [[emit/files]] made."
  [{:keys [kind path resolved]} :- ::emit/file]
  (case kind
    :metric {:kind                   :metric
             :name                   (-> resolved :ir :name)
             :entity-id              (:entity-id resolved)
             :path                   path
             :notes                  (:notes resolved)
             :unsupported-dimensions (:unsupported-dimensions resolved)}))

(mu/defn- parse :- ::ir/semantic-layer
  "The IR of `raw`, parsed by the `source-type` source's [[interface/raw->ir]] with its `options`, once the source's
  namespace is loaded."
  [source-type :- :keyword
   raw         :- ::interface/raw
   options     :- ::interface/options]
  (when-let [source-namespace (source-namespaces source-type)]
    ;; The namespace is looked up in [[source-namespaces]] at runtime, so the module linter cannot tell which one this
    ;; requires.
    #_{:clj-kondo/ignore [:metabase/modules]}
    (classloader/require source-namespace))
  (interface/raw->ir source-type raw options))

(mu/defn convert! :- ::report
  "Import `raw`, a semantic layer as the source `:type` writes it, with the source's own `options`, and write the
  serdes tree to `out-dir`: parse it into the IR, resolve that with `config` (see `::config/config`), and emit what
  resolved. Returns a report of what was converted and what was not.

  dbt is the only source so far: `:type` `:dbt`, with `:raw` the path of the `manifest.json` `dbt parse` writes and
  `:options` `{:entity-models {entity-name semantic-model-name}}` (see
  `:metabase-enterprise.semantic-layer-import.dbt.parse/options`).

  Check the tree with [[preflight]], then import it with

      MB_DB_CONNECTION_URI=... clojure -M:run:ee import <out-dir> -e"
  [{source-type :type, :keys [raw options out-dir config]} :- [:map {:closed true}
                                                               [:type    :keyword]
                                                               [:raw     ::interface/raw]
                                                               [:options {:optional true} ::interface/options]
                                                               [:out-dir :string]
                                                               [:config  ::config/config]]]
  (let [semantic-layer (parse source-type raw (or options {}))
        _              (check-driver (:driver config) (:warehouse semantic-layer))
        resolved       (resolve/resolve-semantic-layer config semantic-layer)
        files          (emit/files config resolved)]
    (emit/write! out-dir files)
    {:out-dir     out-dir
     :converted   (mapv converted (filter :kind files))
     :unsupported (mapv #(select-keys % [:kind :name :reason]) (:unsupported resolved))
     :errors      (:errors resolved)}))

(mu/defn preflight :- ::preflight/report
  "Check the tree [[convert!]] wrote under `out-dir` against the current app DB, the one this REPL was started with,
  which has to be the instance `import` will be given: every Database, Table and Field the cards name has to exist and
  be active, since the import creates a stub for any it cannot find and reports success, and the card fails only when
  it is run (see [[metabase-enterprise.semantic-layer-import.preflight]]). Returns the cards with references the
  import would not bind, each with what is there instead; import when it is empty."
  [{:keys [out-dir]} :- [:map {:closed true}
                         [:out-dir :string]]]
  (preflight/check out-dir))

(comment
  (convert! {:type    :dbt
             :raw     "/path/to/dbt-business-intelligence/target/manifest.json"
             :out-dir "/path/to/dbt-metrics-serdes"
             :config  {:databases     {"dbt_bi" "Sales DB"}
                       :driver        :postgres
                       :creator-email "admin@example.com"}})
  (preflight {:out-dir "/path/to/dbt-metrics-serdes"}))
