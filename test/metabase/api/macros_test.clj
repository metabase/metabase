(ns metabase.api.macros-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.macros :as api.macros]
   [metabase.util.malli.registry :as mr]))

(mr/def ::id pos-int?)

#_{:clj-kondo/ignore [:unused-private-var]}
(def ^:private RouteParams
  [:map
   [:id [:string {:api/regex #"[abc]{4}"}]]])

(deftest ^:parallel parse-args-regexes-test
  (are [args expected] (=? expected
                           (binding [*ns* (the-ns 'metabase.api.macros-test)]
                             (#'api.macros/parse-defendpoint-args args)))
    '(:post "/move/:id"
            [{:keys [id]} :- [:map
                              [:id pos-int?]]]
            (neat))
    {:route {:path "/move/:id", :regexes {:id #"[0-9]+"}}}

    '(:post "/move/:id"
            [{:keys [id]} :- [:map
                              [:id uuid?]]]
            (neat))
    {:route {:path "/move/:id", :regexes {:id #"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"}}}

    '(:post "/move/:id"
            [{:keys [id]} :- [:map
                              [:id ::id]]]
            (neat))
    {:route {:path "/move/:id", :regexes {:id #"[0-9]+"}}}

    '(:post "/move/:id"
            [{:keys [id]} :- RouteParams]
            (neat))
    {:route {:path "/move/:id", :regexes {:id #"[abc]{4}"}}}))
