(ns metabase.channel.impl.util)

(defn remove-inline-parameters
  "Filters out parameters that are inline parameters in the given dashboard parts. Useful for obtaining a list of only
  top-level dashboard parameters."
  [parameters dashboard-parts]
  (let [inline-param-ids (->> dashboard-parts
                              (mapcat (fn [dashboard-part]
                                        (if-let [dashcard (:dashcard dashboard-part)]
                                          ;; normal dashcards
                                          (-> dashcard :visualization_settings :inline_parameters)
                                          ;; header dashcards: viz settings are sent as the top-level dashboard part, so
                                          ;; look for :inline_parameters directly
                                          (-> dashboard-part :inline_parameters))))
                              (keep :id)
                              set)]
    (filter #(not (inline-param-ids (:id %))) parameters)))
