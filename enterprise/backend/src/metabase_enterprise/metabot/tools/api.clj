(ns metabase-enterprise.metabot.tools.api
  "EE-only metabot tool endpoints for transforms and dependencies."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.metabot.tools.dependencies :as metabot.tools.dependencies]
   [metabase-enterprise.metabot.tools.transforms-write :as metabot.tools.transforms-write]
   [metabase.metabot.tools.deftool :refer [deftool]]
   [metabase.metabot.tools.transforms :as metabot.tools.transforms]
   [metabase.metabot.util :as metabot.u]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

;;; ------------------------------------------------ Transform Schemas ------------------------------------------------

(mr/def ::basic-transform
  [:map
   {:decode/tool-api-response #(update-keys % metabot.u/safe->snake_case_en)}
   [:id :int]
   [:name :string]
   [:type [:enum {:decode/tool-api-response name} "mbql" "native" "python"]]
   [:description {:optional true} [:maybe :string]]
   [:entity_id {:optional true} [:maybe :string]]
   ;; :source keys are not snake_cased to match what the FE expects / provides in user_is_viewing context
   [:source ::metabot.tools.transforms/transform-source]])

(mr/def ::full-transform
  [:merge
   ::basic-transform
   [:map {:decode/tool-api-response #(update-keys % metabot.u/safe->snake_case_en)}
    [:created_at ms/TemporalString]
    [:updated_at ms/TemporalString]
    ;; :target keys are not snake_cased to match what the FE expects / provides in user_is_viewing context
    [:target ::metabot.tools.transforms/transform-target]]])

;;; ------------------------------------------------ Transform Tools --------------------------------------------------

(mr/def ::get-transforms-result
  [:or
   [:map
    {:decode/tool-api-response #(update-keys % metabot.u/safe->snake_case_en)}
    [:structured_output [:sequential ::basic-transform]]]
   [:map [:output :string]]])

(deftool "/get-transforms"
  "Get a list of all known transforms."
  {:result-schema ::get-transforms-result
   :handler       metabot.tools.transforms/get-transforms})

(mr/def ::get-transform-details-arguments
  [:and
   [:map
    [:transform_id :int]]
   [:map {:encode/tool-api-request
          #(set/rename-keys % {:transform_id :transform-id})}]])

(mr/def ::get-transform-details-result
  [:or
   [:map {:decode/tool-api-response #(update-keys % metabot.u/safe->snake_case_en)}
    [:structured_output [:sequential ::full-transform]]]
   [:map [:output :string]]])

(deftool "/get-transform-details"
  "Get information about a transform."
  {:args-schema   ::get-transform-details-arguments
   :result-schema ::get-transform-details-result
   :handler       metabot.tools.transforms/get-transform-details})

(mr/def ::get-transform-python-library-details-arguments
  [:and
   [:map
    [:path :string]]
   [:map {:encode/tool-api-request
          #(update-keys % metabot.u/safe->kebab-case-en)}]])

(mr/def ::get-transform-python-library-details-result
  [:or
   [:map {:decode/tool-api-response #(update-keys % metabot.u/safe->snake_case_en)}
    [:structured_output [:map {:decode/tool-api-response #(update-keys % metabot.u/safe->snake_case_en)}
                         [:source :string]
                         [:path :string]
                         [:created_at ms/TemporalString]
                         [:updated_at ms/TemporalString]]]]
   [:map [:output :string]]])

(deftool "/get-transform-python-library-details"
  "Get information about a Python library by path."
  {:args-schema   ::get-transform-python-library-details-arguments
   :result-schema ::get-transform-python-library-details-result
   :handler       metabot.tools.transforms-write/get-transform-python-library-details})

;;; --------------------------------------------- Dependency Tools ----------------------------------------------------

(mr/def ::check-transform-dependencies-arguments
  [:and
   [:map
    [:transform_id :int]
    [:source ::metabot.tools.transforms/transform-source]]
   [:map {:encode/tool-api-request
          #(set/rename-keys % {:transform_id :id})}]])

(mr/def ::broken-question
  [:map {:decode/tool-api-response #(update-keys % metabot.u/safe->snake_case_en)}
   [:id :int]
   [:name :string]])

(mr/def ::broken-transform
  [:map {:decode/tool-api-response #(update-keys % metabot.u/safe->snake_case_en)}
   [:id :int]
   [:name :string]])

(mr/def ::check-transform-dependencies-result
  [:or
   [:map {:decode/tool-api-response #(update-keys % metabot.u/safe->snake_case_en)}
    [:structured_output [:map
                         [:success :boolean]
                         [:bad_transform_count :int]
                         [:bad_transforms [:sequential ::broken-transform]]
                         [:bad_question_count :int]
                         [:bad_questions [:sequential ::broken-question]]]]]
   [:map [:output :string]]])

(deftool "/check-transform-dependencies"
  "Check a proposed edit to a transform and return details of cards or transforms that would be broken by the change."
  {:args-schema   ::check-transform-dependencies-arguments
   :result-schema ::check-transform-dependencies-result
   :handler       metabot.tools.dependencies/check-transform-dependencies})

