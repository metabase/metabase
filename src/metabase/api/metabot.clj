(ns metabase.api.metabot
  (:require
   [compojure.core :refer [POST]]
   [metabase.api.common :as api]
   [metabase.models.persisted-info :as persisted-info]
   ;[metabase.query-processor :as qp]
   ;[metabase.query-processor.middleware.permissions :as qp.perms]
   ))

(set! *warn-on-reflection* true)

;#_{:clj-kondo/ignore [:deprecated-var]}
;(api/defendpoint-schema GET "/model"
;  "Fetch a native version of an MBQL query."
;  [:as {query :body}]
;  (binding [persisted-info/*allow-persisted-substitution* false]
;    (qp.perms/check-current-user-has-adhoc-native-query-perms query)
;    (qp/compile-and-splice-parameters query)))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/model"
  "Fetch a native version of an MBQL query."
  [:as {{question :question} :body :as body}]
  (tap> body)
  (binding [persisted-info/*allow-persisted-substitution* false]
    ;(qp.perms/check-current-user-has-adhoc-native-query-perms query)
    (let [response {:sql_query               (format "SELECT * FROM '%s'" question)
                    :original_question       question
                    :suggested_visualization [:pie_chart]}]
      (tap> response)
      response)))

(api/define-routes)
