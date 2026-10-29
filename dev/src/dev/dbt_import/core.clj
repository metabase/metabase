(ns dev.dbt-import.core
  "REPL entry point for the dbt → Metabase metric converter: parse a manifest, resolve it, write serdes YAML. See
  the README in this directory for how to produce the manifest and import the result."
  (:require
   [dev.dbt-import.adapter :as adapter]
   [dev.dbt-import.emit :as emit]
   [dev.dbt-import.parse :as parse]
   [dev.dbt-import.preflight :as preflight]
   [dev.dbt-import.resolve :as resolve]
   [dev.dbt-import.schemas.resolved :as resolved]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::report
  "What a run converted, with the file each metric was written to, its notes (where it agrees with dbt only under some
  conditions, see [[dev.dbt-import.resolve/notes]]) and the dimensions it could not give the metric; what it could not
  convert, with the reason; and what the converter itself failed on, naming the exception."
  [:map {:closed true}
   [:out-dir     :string]
   [:converted   [:sequential [:map {:closed true}
                               [:name                   :string]
                               [:entity-id              ms/NanoIdString]
                               [:path                   :string]
                               [:notes                  [:sequential :string]]
                               [:unsupported-dimensions [:sequential ::resolved/unsupported-dimension]]]]]
   [:unsupported [:sequential [:map {:closed true}
                               [:name :string]
                               [:reason :string]]]]
   [:errors      [:sequential ::resolved/error]]])

(mu/defn convert! :- ::report
  "Parse the dbt `manifest` file, resolve it with `config` (see `::resolved/config`), and write the serdes tree to
  `out-dir`. Returns a report of what was converted and what was not. Import the result with

      MB_DB_CONNECTION_URI=... clojure -M:run:ee import <out-dir> -e"
  [{:keys [manifest out-dir config]} :- [:map {:closed true}
                                         [:manifest :string]
                                         [:out-dir  :string]
                                         [:config   ::resolved/config]]]
  (let [ir       (parse/parse-manifest-file manifest)
        _        (adapter/check-driver (:driver config) (:adapter-type ir))
        resolved (resolve/resolve-manifest config ir)
        files    (emit/files config resolved)]
    (emit/write! out-dir files)
    {:out-dir     out-dir
     :converted   (vec (for [{:keys [path metric]} files
                             :when metric]
                         {:name                   (-> metric :ir :name)
                          :entity-id              (:entity-id metric)
                          :path                   path
                          :notes                  (:notes metric)
                          :unsupported-dimensions (:unsupported-dimensions metric)}))
     :unsupported (mapv #(select-keys % [:name :reason]) (:unsupported resolved))
     :errors      (:errors resolved)}))

(mu/defn preflight :- ::preflight/report
  "Check the tree [[convert!]] wrote under `out-dir` against the current app DB, the one this REPL was started with,
  which has to be the instance `import` will be given: every Database, Table and Field the cards name has to exist and
  be active, since the import creates a stub for any it cannot find and reports success, and the card fails only when
  it is run (see [[dev.dbt-import.preflight]]). Returns the cards with references the import would not bind, each
  with what is there instead; import when it is empty."
  [{:keys [out-dir]} :- [:map {:closed true}
                         [:out-dir :string]]]
  (preflight/check out-dir))

(comment
  (convert! {:manifest "/path/to/dbt-business-intelligence/target/manifest.json"
             :out-dir  "/path/to/dbt-metrics-serdes"
             :config   {:databases     {"dbt_bi" "Sales DB"}
                        :driver        :postgres
                        :creator-email "admin@example.com"}})
  (preflight {:out-dir "/path/to/dbt-metrics-serdes"}))
