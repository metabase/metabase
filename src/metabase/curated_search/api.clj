(ns metabase.curated-search.api
  "Admin REST API for managing curated search entries: curated search prompts mapped to the entities
  that answer them."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.request.core :as request]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private EntityRef
  "Entity ref as accepted on writes: the model must be a known agent-facing entity type (as used with
  read_resource), plus plain \"card\"."
  [:map
   [:model [:enum "table" "card" "model" "metric" "question"]]
   [:id    ms/PositiveInt]
   [:name  {:optional true} :string]])

(def ^:private EntityRefOut
  "Entity ref as returned on reads. `:model` is any string: rows can predate a model string's retirement
  (serdes tolerates those too), and one legacy row must not fail response validation for a whole list."
  [:map
   [:model :string]
   [:id    :int]
   [:name  {:optional true} :string]])

(def ^:private Entry
  [:map
   [:id                 ms/PositiveInt]
   [:search_prompt      :string]
   [:usage_instructions {:optional true} [:maybe :string]]
   [:entity             EntityRefOut]
   [:verified           :boolean]])

(def ^:private default-limit 50)
(def ^:private default-offset 0)

(api.macros/defendpoint :get "/"
  :- [:map
      [:data   [:sequential Entry]]
      [:total  :int]
      [:limit  :int]
      [:offset :int]]
  "Get all curated search entries, paginated."
  [_route-params
   _query-params]
  (api/check-superuser)
  (let [limit  (or (request/limit) default-limit)
        offset (or (request/offset) default-offset)]
    {:data   (t2/select :model/CuratedSearchEntry
                        {:order-by [[:id :asc]]
                         :limit    limit
                         :offset   offset})
     :total  (t2/count :model/CuratedSearchEntry)
     :limit  limit
     :offset offset}))

(api.macros/defendpoint :get "/:id"
  :- Entry
  "Get a curated search entry by ID."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/CuratedSearchEntry :id id)))

(api.macros/defendpoint :post "/"
  :- Entry
  "Create a new curated search entry."
  [_route-params
   _query-params
   {:keys [search_prompt usage_instructions entity verified]}
   :- [:map
       [:search_prompt      ms/NonBlankString]
       [:usage_instructions {:optional true} [:maybe :string]]
       [:entity             EntityRef]
       [:verified           {:optional true} [:maybe :boolean]]]]
  (api/check-superuser)
  (t2/insert-returning-instance! :model/CuratedSearchEntry
                                 {:search_prompt      search_prompt
                                  :usage_instructions usage_instructions
                                  :entity             entity
                                  :verified           (boolean verified)}))

(api.macros/defendpoint :put "/:id"
  :- Entry
  "Update a curated search entry by ID. Only the provided fields are changed; sending a null
  usage_instructions clears it."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   ;; patch semantics: presence of a key (not nil-ness of its value) decides what changes, so an explicit
   ;; null can clear the nullable usage_instructions. The non-nullable fields reject null in the schema.
   {:keys [search_prompt usage_instructions entity verified] :as body}
   :- [:map
       [:search_prompt      {:optional true} ms/NonBlankString]
       [:usage_instructions {:optional true} [:maybe :string]]
       [:entity             {:optional true} EntityRef]
       [:verified           {:optional true} :boolean]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/CuratedSearchEntry :id id))
  (let [changes (cond-> {}
                  (contains? body :search_prompt)      (assoc :search_prompt search_prompt)
                  (contains? body :usage_instructions) (assoc :usage_instructions usage_instructions)
                  (contains? body :entity)             (assoc :entity entity)
                  (contains? body :verified)           (assoc :verified verified))]
    (when (seq changes)
      (t2/update! :model/CuratedSearchEntry id changes)))
  (t2/select-one :model/CuratedSearchEntry :id id))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id"
  "Delete a curated search entry by ID."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/CuratedSearchEntry :id id))
  (t2/delete! :model/CuratedSearchEntry :id id)
  api/generic-204-no-content)
