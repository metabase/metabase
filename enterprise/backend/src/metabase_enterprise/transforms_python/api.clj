(ns metabase-enterprise.transforms-python.api
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transforms-python.models.python-library :as python-library]
   [metabase-enterprise.transforms-python.python-runner :as python-runner]
   [metabase-enterprise.transforms-python.settings :as transforms-python.settings]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli.schema :as ms]))

(defn get-python-library-by-path
  "Get Python library details by path for use by other APIs."
  [path]
  (api/check-superuser)
  (-> (python-library/get-python-library-by-path path)
      api/check-404
      (select-keys [:source :path :created_at :updated_at])))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/library/:path"
  "Get the Python library for user modules."
  [{:keys [path]} :- [:map [:path ms/NonBlankString]]
   _query-params]
  (get-python-library-by-path path))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/library/:path"
  "Update the Python library source code for user modules."
  [{:keys [path]} :- [:map [:path ms/NonBlankString]]
   _query-params
   body :- [:map {:closed true}
            [:source :string]]]
  (api/check-superuser)
  (python-library/update-python-library-source! path (:source body)))

(api.macros/defendpoint :post "/test-run"
  :- [:map
      [:logs :string]
      [:error {:optional true} [:map [:message i18n/LocalizedString]]]
      [:output {:optional true} [:map
                                 [:cols [:sequential [:map [:name :string]]]]
                                 [:rows [:sequential :any]]]]]
  "Evaluate an ad-hoc python transform on a sample of input data.
  Intended for short runs for early feedback. Input/output/timeout limits apply."
  [_
   _
   {:keys [code
           source_tables
           output_row_limit
           per_input_row_limit]
    :or   {output_row_limit    100
           per_input_row_limit 100}}
   :- [:map
       [:code                       :string]
       [:source_tables              [:map-of :string :int]]
       [:output_row_limit    {:optional true} [:and :int [:> 1] [:<= 100]]]
       [:per_input_row_limit {:optional true} [:and :int [:> 1] [:<= 100]]]]]
  (api/check-superuser)
  ;; NOTE: we do not test database support, as there is no write target.
  (let [result (python-runner/execute-and-read-output!
                {:code            code
                 :source-tables   source_tables
                 :per-input-limit per_input_row_limit
                 :row-limit       output_row_limit
                 :timeout-secs    (transforms-python.settings/python-runner-test-run-timeout-seconds)})
        logs   (str/join "\n" (map :message (:logs result)))]
    (if (= :succeeded (:status result))
      {:logs   logs
       :output {:cols (mapv #(select-keys % [:name]) (:cols result))
                :rows (:rows result)}}
      {:logs  logs
       :error {:message (:message result)}})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transforms-python` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
