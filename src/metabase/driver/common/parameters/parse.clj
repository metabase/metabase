(ns metabase.driver.common.parameters.parse
  "DEPRECATED: `driver.common.parameters.*` namespaces deal with legacy MBQL queries. Migrate to MBQL-5-friendly
  replacement namespaces. The replacement for this namespace is [[metabase.lib.parameters.parse]]."
  {:deprecated "0.57.0"}
  (:require
   [clojure.core.match :refer [match]]
   [clojure.string :as str]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.driver.common.parameters :as params]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util.malli :as mu])
  (:import
   (metabase.driver.common.parameters Optional FunctionParam Param)))

(set! *warn-on-reflection* true)

(def ^:private ParsedToken
  [:or
   :string
   (lib.schema.common/instance-of-class Param)
   (lib.schema.common/instance-of-class FunctionParam)
   (lib.schema.common/instance-of-class Optional)])

(defn- ->param [value]
  (match [value]
    [s :guard string?] s
    [{:type :metabase.lib.parse/param
      :name name}] (params/->Param (or (lib/match-and-normalize-tag-name name) (str/trim name)))
    [{:type :metabase.lib.parse/optional
      :contents contents}] (params/->Optional (map ->param contents))))

(mu/defn parse :- [:sequential ParsedToken]
  "Attempts to parse parameters in string `s`. Parses any optional clauses or parameters found, and returns a sequence
   of non-parameter string fragments (possibly) interposed with `Param` or `Optional` instances.

   If `handle-sql-comments` is true (default) then we make a best effort to ignore params in SQL comments."
  ([s :- :string]
   (parse s true))

  ([s                   :- :string
    handle-sql-comments :- :boolean]
   (->> (lib/parse {:parse-error-type qp.error-type/invalid-query}
                   s
                   handle-sql-comments)
        (map ->param))))
