(ns metabase-enterprise.data-testing.card-api
  "`/api/ee/card-test`: saved tests of cards."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.models.card-test :as data-testing.models.card-test]
   [metabase-enterprise.data-testing.runner :as data-testing.runner]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn- refusing :- [:maybe ::data-testing.schema/run-result]
  "Call `thunk`, rethrowing a typed refusal as [[data-testing.errors/refusing]] does, under the `card-test` prefix."
  [thunk :- ifn?]
  (data-testing.errors/refusing "card-test" thunk))

(mu/defn- validate-test! :- :nil
  "Refuse a test of the Card `card-id` with `inputs` and `expectations` unless it could run."
  [card-id      :- ms/PositiveInt
   inputs       :- ::data-testing.schema/inputs
   expectations :- ::data-testing.schema/expectations]
  (refusing #(data-testing.runner/validate-test :card (data-testing.db/card card-id) inputs expectations)))

(api.macros/defendpoint :get "/" :- [:sequential ::data-testing.schema/card-test.response]
  "List the card tests the caller can read, with their newest runs, optionally only those of one card. Needs Data Studio
  access."
  [_route-params
   {:keys [card-id]} :- [:map {:closed true}
                         [:card-id {:optional true} [:maybe ms/PositiveInt]]]]
  (api/check-data-studio-access)
  (-> (filter mi/can-read? (data-testing.db/card-tests {:card-id card-id}))
      (t2/hydrate :last_run)))

(api.macros/defendpoint :get "/:id" :- ::data-testing.schema/card-test.response
  "Get a card test with its newest run."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (-> (api/read-check :model/CardTest id)
      (t2/hydrate :last_run)))

(api.macros/defendpoint :post "/" :- ::data-testing.schema/card-test
  "Create a card test."
  [_route-params
   _query-params
   {:keys [card_id inputs expectations] :as body} :- ::data-testing.schema/card-test.create]
  (api/create-check :model/CardTest body)
  (validate-test! card_id inputs expectations)
  (data-testing.db/insert-card-test! (assoc body :creator_id api/*current-user-id*)))

(api.macros/defendpoint :put "/:id" :- ::data-testing.schema/card-test
  "Update a card test."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   _query-params
   body :- ::data-testing.schema/card-test.update]
  (let [card-test (api/read-check :model/CardTest id)]
    (api/update-check card-test body)
    (when (some #(contains? body %) [:card_id :inputs :expectations])
      (let [{:keys [card_id inputs expectations]} (merge card-test body)]
        (validate-test! card_id inputs expectations)))
    (when (seq body)
      (data-testing.db/update-card-test! id body)))
  (data-testing.db/card-test id))

(api.macros/defendpoint :delete "/:id" :- :nil
  "Delete a card test."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/write-check :model/CardTest id)
  (data-testing.db/delete-card-test! id)
  nil)

(api.macros/defendpoint :post "/:id/run" :- ::data-testing.schema/run-result
  "Run a card test. Needs read access to the test and native query access to its card's database.

  A 200 means the run happened: `:status` is then `passed` or `failed`, and every expectation reports what it found,
  including one that could not be evaluated, which comes back as that expectation's own `:error`.

  Any other status means the run was refused and nothing meaningful ran. A refusal of the test itself carries the
  `:error-code` naming which refusal it was; a missing test (404), missing permission (403) or missing feature (402)
  carries none."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (let [card-test (api/read-check :model/CardTest id)]
    (api/check-403 (data-testing.models.card-test/can-run? card-test))
    (refusing #(data-testing.runner/run-test! :card (data-testing.db/card (:card_id card-test)) card-test))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/card-test` routes."
  (api.macros/ns-handler *ns* +auth))
