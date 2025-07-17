(ns metabase.query-processor.parameters.parse
  (:require
   [clojure.core.match :refer [match]]
   [metabase.lib.parse :as lib.parse]
   [metabase.query-processor.parameters :as params]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::parsed-token
  [:or
   :string
   ::params/param
   ::params/function-param
   ::params/optional])

(defn- ->param [value]
  (match [value]
    [s :guard string?]
    s

    [{:type :metabase.lib.parse/param
      :name param-name}]
    (params/param param-name)

    [{:type :metabase.lib.parse/function-param
      :name param-name
      :args args}]
    (params/function-param param-name (mapv ->param args))

    [{:type     :metabase.lib.parse/optional
      :contents contents}]
    (params/optional (mapv ->param contents))))

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
