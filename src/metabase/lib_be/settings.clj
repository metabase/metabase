(ns metabase.lib-be.settings
  (:require
   [environ.core :as env]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru trs]]))

(defsetting enable-nested-queries
  (deferred-tru "Allow using a saved question or Model as the source for other queries?")
  :type       :boolean
  :default    true
  :setter     :none
  :visibility :authenticated
  :export?    true
  :getter     (fn enable-nested-queries-getter []
                ;; only false if explicitly set `false` by the environment
                (not= "false" (u/lower-case-en (env/env :mb-enable-nested-queries))))
  :audit      :getter)

(defsetting breakout-bins-num
  (deferred-tru
   (str "When using the default binning strategy and a number of bins is not provided, "
        "this number will be used as the default."))
  :type    :integer
  :export? true
  :default 8
  :audit   :getter)

(defsetting breakout-bin-width
  (deferred-tru
   (str "When using the default binning strategy for a field of type Coordinate (such as Latitude and Longitude), "
        "this number will be used as the default bin width (in degrees)."))
  :type    :double
  :default 10.0
  :audit   :getter)

;;; TODO -- not 100% sure about putting this here but I have no better ideas. Maybe `system`??
(defsetting start-of-week
  (deferred-tru
   (str "This will affect things like grouping by week or filtering in GUI queries. "
        "It won''t affect most SQL queries, "
        "although it is used to set the WEEK_START session variable in Snowflake."))
  :visibility :public
  :export?    true
  :type       :keyword
  :default    :sunday
  :audit      :raw-value
  :getter     (fn []
                ;; if something invalid is somehow in the DB just fall back to Sunday
                (when-let [value (setting/get-value-of-type :keyword :start-of-week)]
                  (if (#{:monday :tuesday :wednesday :thursday :friday :saturday :sunday} value)
                    value
                    :sunday)))
  :setter      (fn [new-value]
                 (when new-value
                   (assert (#{:monday :tuesday :wednesday :thursday :friday :saturday :sunday} (keyword new-value))
                           (trs "Invalid day of week: {0}" (pr-str new-value))))
                 (setting/set-value-of-type! :keyword :start-of-week new-value)))
