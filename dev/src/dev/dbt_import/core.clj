(ns dev.dbt-import.core
  "REPL entry point for the dbt → Metabase metric converter: parse a manifest, resolve it, write serdes YAML. See
  the README in this directory for how to produce the manifest and import the result."
  (:require
   [dev.dbt-import.emit :as emit]
   [dev.dbt-import.parse :as parse]
   [dev.dbt-import.resolve :as resolve]
   [dev.dbt-import.schemas.resolved :as resolved]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::report
  "What a run converted, with the file each metric was written to and the dimensions it could not give the metric,
  and what it could not convert, with the reason."
  [:map
   [:out-dir     :string]
   [:converted   [:sequential [:map
                               [:name                   :string]
                               [:entity-id              ::resolved/entity-id]
                               [:path                   :string]
                               [:unsupported-dimensions [:sequential ::resolved/unsupported-dimension]]]]]
   [:unsupported [:sequential [:map
                               [:name :string]
                               [:reason :string]]]]])

(mu/defn convert! :- ::report
  "Parse the dbt `manifest` file, resolve it with `config` (see `::resolved/config`), and write the serdes tree to
  `out-dir`. Returns a report of what was converted and what was not. Import the result with

      MB_DB_CONNECTION_URI=... clojure -M:run:ee import <out-dir> -e"
  [{:keys [manifest out-dir config]} :- [:map {:closed true}
                                         [:manifest :string]
                                         [:out-dir  :string]
                                         [:config   ::resolved/config]]]
  (let [resolved (resolve/resolve-manifest config (parse/parse-manifest-file manifest))
        files    (emit/files config resolved)]
    (emit/write! out-dir files)
    {:out-dir     out-dir
     :converted   (vec (for [{:keys [path metric]} files
                             :when metric]
                         {:name                   (-> metric :metric :name)
                          :entity-id              (:entity-id metric)
                          :path                   path
                          :unsupported-dimensions (:unsupported-dimensions metric)}))
     :unsupported (mapv #(select-keys % [:name :reason]) (:unsupported resolved))}))

(comment
  (convert! {:manifest "/home/cam/dbt-business-intelligence/target/manifest.json"
             :out-dir  "/home/cam/dbt-metrics-serdes"
             :config   {:databases     {"dbt_bi" "Sales DB"}
                        :driver        :postgres
                        :creator-email "admin@example.com"}}))
