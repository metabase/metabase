(ns metabase.lib.parameters.parse
  (:refer-clojure :exclude [mapv])
  (:require
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.parameters.parse.types :as lib.params.parse.types]
   [metabase.lib.parse :as lib.parse]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.match :as match]
   [metabase.util.performance :refer [mapv]]))

(mr/def ::parsed-token
  [:or
   :string
   ::lib.params.parse.types/param
   ::lib.params.parse.types/function-param
   ::lib.params.parse.types/optional])

(defn- ->param [value]
  (match/match-one value
    (s :guard string?)
    s

    {:type :metabase.lib.parse/param
     :name param-name}
    (lib.params.parse.types/param (lib.normalize/normalize ::lib.schema.template-tag/name param-name {:throw? true}))

    {:type :metabase.lib.parse/function-param
     :name param-name
     :args args}
    (lib.params.parse.types/function-param {:function-name param-name, :args (mapv ->param args)})

    {:type     :metabase.lib.parse/optional
     :contents contents}
    (lib.params.parse.types/optional (mapv ->param contents))

    _ (throw (ex-info "Invalid value." {:value value}))))

(mu/defn parse :- [:sequential ::parsed-token]
  "Attempts to parse parameters in string `s`. Parses any optional clauses or parameters found, and returns a sequence
   of non-parameter string fragments (possibly) interposed with `Param` or `Optional` instances.

   If `handle-sql-comments` is true (default) then we make a best effort to ignore params in SQL comments."
  ([s :- :string]
   (parse s true))

  ([s                   :- :string
    handle-sql-comments :- :boolean]
   (->> (lib.parse/parse {:parse-error-type :invalid-query}
                         s
                         handle-sql-comments)
        (mapv ->param))))
