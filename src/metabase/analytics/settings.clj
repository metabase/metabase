(ns metabase.analytics.settings
  (:require    [clojure.tools.logging :as log]
               [metabase.models.setting :as setting :refer [defsetting]]
               [metabase.util.i18n :refer [deferred-trs]]))

(defsetting prometheus-server-port
  (deferred-trs (str "Port to serve prometheus metrics from. If set, prometheus collectors are registered"
                     " and served from `localhost:<port>/metrics`."))
  :type       :integer
  :visibility :internal
  ;; settable only through environmental variable
  :setter     :none
  :getter     (fn reading-prometheus-port-setting []
                (let [parse (fn [raw-value]
                              (if-let [parsed (parse-long raw-value)]
                                parsed
                                (log/warnf "MB_PROMETHEUS_SERVER_PORT value of '%s' is not parseable as an integer." raw-value)))]
                  (setting/get-raw-value :prometheus-server-port integer? parse))))
