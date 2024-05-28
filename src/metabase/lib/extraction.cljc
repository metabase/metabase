(ns metabase.lib.extraction
  (:require
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.extraction :as lib.schema.extraction]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(defn- column-extract-temporal-units [column]
  (let [time-units [:hour-of-day]
        date-units [:day-of-month :day-of-week :month-of-year :quarter-of-year :year]]
    (vec (for [unit (concat (when-not (lib.types.isa/date-without-time? column)
                              time-units)
                            (when-not (lib.types.isa/time? column)
                              date-units))]
           {:lib/type     ::extraction
            :tag          unit
            :column       column
            :display-name (lib.temporal-bucket/describe-temporal-unit unit)}))))

(defn- regex-available? [metadata-providerable]
  (-> (lib.metadata/database metadata-providerable)
      :features
      (contains? :regex)))

(defn- domain-extraction [column]
  {:lib/type     ::extraction
   :tag          :domain
   :column       column
   :display-name (i18n/tru "Domain")})

(defn- subdomain-extraction [column]
  {:lib/type     ::extraction
   :tag          :subdomain
   :column       column
   :display-name (i18n/tru "Subdomain")})

(defn- host-extraction [column]
  {:lib/type     ::extraction
   :tag          :host
   :column       column
   :display-name (i18n/tru "Host")})

(defn- email-extractions [column]
  [(domain-extraction    column)
   (host-extraction      column)])

(defn- url-extractions [column]
  [(domain-extraction    column)
   (subdomain-extraction column)
   (host-extraction      column)])

(mu/defn column-extractions :- [:maybe [:sequential ::lib.schema.extraction/extraction]]
  "Column extractions are a set of transformations possible on a given `column`, based on its type.

  For example, we might extract the day of the week from a temporal column, or the domain name from an email or URL.

  Returns a list of possible column extractions for the given column, or `nil` if there are none."
  [query  :- ::lib.schema/query
   column :- ::lib.schema.metadata/column]
  (cond
    (lib.types.isa/temporal? column) (column-extract-temporal-units column)

    ;; The URL and email extractions are powered by regular expressions, and not every database supports those.
    ;; If the target database doesn't support :regex feature, return nil.
    (not (regex-available? query))   nil
    (lib.types.isa/email? column)    (email-extractions column)
    (lib.types.isa/URL? column)      (url-extractions column)))

(defmethod lib.metadata.calculation/display-info-method ::extraction
  [_query _stage-number extraction]
  (dissoc extraction :lib/type :column))

(mu/defn extraction-expression :- ::lib.schema.expression/expression
  "Given an `extraction` as returned by [[column-extractions]], return the expression clause that should be added to a
  query."
  [{:keys [column tag] :as _expression} :- ::lib.schema.extraction/extraction
   ]
  (case tag
    ;; Temporal extractions
    :hour-of-day     (lib.expression/get-hour column)
    :day-of-month    (lib.expression/get-day column)
    :day-of-week     (lib.expression/day-name (lib.expression/get-day-of-week column))
    :month-of-year   (lib.expression/month-name (lib.expression/get-month column))
    :quarter-of-year (lib.expression/quarter-name (lib.expression/get-quarter column))
    :year            (lib.expression/get-year column)
    ;; URLs and emails
    :domain          (lib.expression/domain column)
    :subdomain       (lib.expression/subdomain column)
    :host            (lib.expression/host column)))

(mu/defn extract :- ::lib.schema/query
  "Given a query, stage and extraction as returned by [[column-extractions]], apply that extraction to the query."
  [query                                 :- ::lib.schema/query
   stage-number                          :- :int
   {:keys [display-name] :as extraction} :- ::lib.schema.extraction/extraction]
  ;; Currently this is very simple: use the `:tag` as an expression function and the column as the only argument.
  (let [unique-name-fn (->> (lib.util/query-stage query stage-number)
                            (lib.metadata.calculation/returned-columns query stage-number)
                            (map :name)
                            (lib.util/unique-name-generator (lib.metadata/->metadata-provider query)))]
    (lib.expression/expression
     query
     stage-number
     (unique-name-fn display-name)
     (extraction-expression extraction))))
