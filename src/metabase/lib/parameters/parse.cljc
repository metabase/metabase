(ns metabase.lib.parameters.parse
  (:refer-clojure :exclude [mapv])
  (:require
   [clojure.core.match :refer [match]]
   [clojure.string :as str]
   [metabase.lib.native :as lib.native]
   [metabase.lib.parameters.parse.types :as lib.params.parse.types]
   [metabase.lib.parse :as lib.parse]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [mapv]]))

(mr/def ::parsed-token
  [:or
   :string
   ::lib.params.parse.types/param
   ::lib.params.parse.types/function-param
   ::lib.params.parse.types/optional])

(defn- ->param [value]
  (match [value]
    [s :guard string?]
    s

    [{:type :metabase.lib.parse/param
      :name param-name}]
    (lib.params.parse.types/param {:k (or (lib.native/match-and-normalize-tag-name param-name)
                                          (str/trim param-name))})

    [{:type :metabase.lib.parse/function-param
      :name param-name
      :args args}]
    (lib.params.parse.types/function-param {:function-name param-name, :args (mapv ->param args)})

    [{:type     :metabase.lib.parse/optional
      :contents contents}]
    (lib.params.parse.types/optional {:args (mapv ->param contents)})))

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
