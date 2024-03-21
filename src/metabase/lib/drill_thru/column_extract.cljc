(ns metabase.lib.drill-thru.column-extract
  "Adds an expression clause based on the selected column and temporal unit.

  Entry points:

  - Column header

  Query transformation:

  - Add an expression that extracts the specified value from this column."
  (:require
   [medley.core :as m]
   [metabase.lib.drill-thru.column-filter :as lib.drill-thru.column-filter]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.shared.util.time :as shared.ut]
   [metabase.util.malli :as mu]))

(defn- column-extract-temporal-units [column]
  (let [time-units [:hour-of-day]
        date-units [:day-of-month :day-of-week :month-of-year :quarter-of-year :year]]
    (vec (for [unit (concat (when-not (lib.types.isa/date-without-time? column)
                              time-units)
                            (when-not (lib.types.isa/time? column)
                              date-units))]
           {:key          unit
            :display-name (lib.temporal-bucket/describe-temporal-unit unit)}))))

(def ^:private url->host-regex
  ;;    protocol       host    etc.
  #"^(?:[^:/?#]*:?//)?([^/?#]*).*$")

(def ^:private host->domain-regex
  ;; Deliberately no ^ at the start; there might be several subdomains before this spot.
  ;; By "short tail" below, I mean a pseudo-TLD nested under a proper TLD. For example, mycompany.co.uk.
  ;; This can accidentally capture a short domain name, eg. "subdomain.aol.com" -> "subdomain", oops.
  ;; But there's a load of these, not a short list we can include here, so it's either preprocess the (huge) master list
  ;; from Mozilla or accept that this regex is a bit best-effort.

  ;; Skip www  domain   maybe short tail  TLD
  #"(?:www\.)?([^\.]+)\.(?:[^\.]{1,3}\.)?[^\.]+$")

(def ^:private email->domain-regex
  ;; See [[host->domain-regex]] on the challenges of parsing domains with regexes.
  ;; Referencing the indexes below:
  ;; 1. Positive lookbehind: Starting after @ or .
  ;; 2. Negative lookahead: Don't capture www as the domain
  ;; 3. One domain segment
  ;; 4. Positive lookahead:
  ;;      Either:
  ;; 5.     Short final segment (eg. .co.uk)
  ;; 6.     Top-level domain
  ;; 7.     Anchor to end
  ;;      Or:
  ;; 8.     Top-level domain
  ;; 9.     Anchor to end
  ;;1         2        3      (4   5            6      7|  8      9)
  #"(?<=[@\.])(?!www\.)[^@\.]+(?=\.[^@\.]{1,3}\.[^@\.]+$|\.[^@\.]+$)")

(def ^:private host->subdomain-regex
  ;; This grabs the first segment that isn't "www", AND excludes the main domain name.
  ;; See [[host->domain-regex]] for more details about how those are matched.
  ;; Referencing the indexes below:
  ;; 1.  Only at the start of the input
  ;; 2.  Consume "www." if present
  ;; 3.  Start capturing the subdomain we want
  ;; 4.  Negative lookahead: That subdomain can't be "www"; we don't want to backtrack and find "www".
  ;; 5.  Negative lookahead to make sure this isn't the proper domain:
  ;; 6.      Main domain name
  ;; 7.      Optional short tail (eg. co.uk)
  ;; 8.      Top-level domain, ending the input
  ;; 9.  Matching the actual subdomain
  ;; 10. And its dot, which is outside the capture.
  ;;12         34        5  6       7                8       9      10
  #"^(?:www\.)?((?!www\.)(?![^\.]+\.(?:[^\.]{1,3}\.)?[^\.]+$)[^\.]+)\.")

(defn- column-extract-drill-for-column [column]
  (cond
    (lib.types.isa/temporal? column) {:display-name (i18n/tru "Extract day, month…")
                                      :extractions  (column-extract-temporal-units column)}
    (lib.types.isa/email? column)    {:display-name (i18n/tru "Extract domain")
                                      :extractions  [{:key          :email-domain
                                                      :display-name (i18n/tru "Domain")}]}
    (lib.types.isa/URL? column)      {:display-name (i18n/tru "Extract domain, subdomain…")
                                      :extractions  [{:key          :domain
                                                      :display-name (i18n/tru "Domain")}
                                                     {:key          :subdomain
                                                      :display-name (i18n/tru "Subdomain")}]}))

(mu/defn column-extract-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.column-extract]
  "Column clicks on temporal columns only.

  Might add a stage, like `:drill-thru/column-filter` does, if the current stage has aggregations."
  [query                       :- ::lib.schema/query
   stage-number                :- :int
   {:keys [column column-ref value]} :- ::lib.schema.drill-thru/context]
  (when (and column (nil? value))
    (when-let [drill (column-extract-drill-for-column column)]
      (merge drill
             {:lib/type :metabase.lib.drill-thru/drill-thru
              :type     :drill-thru/column-extract}
             (lib.drill-thru.column-filter/prepare-query-for-drill-addition
               query stage-number column column-ref :expression)))))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/column-extract
  [_query _stage-number drill]
  (select-keys drill [:display-name :extractions :type]))

(defn- case-expression
  "Creates a case expression with a condition for each value of the unit."
  [expression-fn unit n]
  (lib.expression/case
    (for [raw-value (range 1 (inc n))]
      [(lib.filter/= (expression-fn) raw-value) (shared.ut/format-unit raw-value unit)])
    ""))

(defn- extraction-expression [column tag]
  (case tag
    ;; Temporal extractions
    :hour-of-day     (lib.expression/get-hour column)
    :day-of-month    (lib.expression/get-day column)
    :day-of-week     (case-expression #(lib.expression/get-day-of-week column) tag 7)
    :month-of-year   (case-expression #(lib.expression/get-month column) tag 12)
    :quarter-of-year (case-expression #(lib.expression/get-quarter column) tag 4)
    :year            (lib.expression/get-year column)
    ;; URLs
    :domain          (-> column
                         (lib.expression/regex-match-first url->host-regex)
                         (lib.expression/regex-match-first host->domain-regex))
    :subdomain       (-> column
                         (lib.expression/regex-match-first url->host-regex)
                         (lib.expression/regex-match-first host->subdomain-regex))
    ;; Emails
    :email-domain    (lib.expression/regex-match-first column email->domain-regex)))

(defmethod lib.drill-thru.common/drill-thru-method :drill-thru/column-extract
  [_query _stage-number {:keys [query stage-number column extractions]} & [tag]]
  (let [tag                    (keyword tag)
        {:keys [display-name]} (m/find-first #(= (:key %) tag) extractions)
        unique-name-fn         (lib.util/unique-name-generator)]
    (doseq [col-name (->> (lib.util/query-stage query stage-number)
                          (lib.metadata.calculation/returned-columns query stage-number)
                          (map :name))]
      (unique-name-fn col-name))
    (lib.expression/expression
      query
      stage-number
      (unique-name-fn display-name)
      (extraction-expression column tag))))
