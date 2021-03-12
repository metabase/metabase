(ns metabase.shared.visualization
  "Shared code for dealing with visualization settings."
  (:require [clojure.string :as str]
            [clojure.spec.alpha :as s]))

(defn- field-id-key [col]
  (keyword (format "[\"ref\",[\"field\",%d,null]]" (:id col))))

(defn- expression-key [col]
  (keyword (format "[\"ref\",[\"expression\",\"%s\"]]" (:expression_name col))))

(def ^:private col-key-regex #"\[\"ref\",\[(?:\"field\",\d+,null|\"expression\",\".+\")\]\]")

(s/def ::column-setting-v1-key #(->> %
                                     (name)
                                     (re-matches col-key-regex)))

(s/def ::column_title string?)

(s/def ::date_style #{"M/D/YYYY" "D/M/YYYY" "YYYY/M/D" "MMMM D, YYYY" "D MMMM, YYYY" "dddd, MMMM D, YYYY"})
(s/def ::date_abbreviate boolean?)
(s/def ::time_style #{"h:mm A" "k:mm" "h A"})
(s/def ::time_enabled #{nil "minutes" "seconds" "milliseconds"})

(s/def ::decimals pos-int?)
(s/def ::number_separators #(and string? (= 2 (count %))))
(s/def ::number_style #{"decimal" "percent" "scientific" "currency"})
(s/def ::prefix string?)
(s/def ::suffix string?)

(s/def ::column-setting-v1-date-format
  (s/keys :req-un [::date_style ::time_style ::time_enabled]
          :opt-un [::column_title]))

(s/def ::column-setting-v1-number-format
  (s/keys :req-un [::decimals ::number_separators ::number_style]
          :opt-un [::column_title ::prefix ::suffix]))

(s/def ::column-setting-v1-value (s/or ::date-column-format ::column-setting-v1-date-format
                                       ::number-column-format ::column-setting-v1-number-format
                                       ::no-formatting (s/keys :opt-un [::column_title])))

(s/def ::column_settings (s/map-of ::column-setting-v1-key ::column-setting-v1-value))

(s/def ::visualization_settings (s/keys :opt-un [::column_settings]))

(s/def ::visualization-settings-v1 ::visualization_settings)
