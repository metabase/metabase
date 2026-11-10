(ns metabase.warehouse-schema.ai-proposals
  "The preview read of Data Studio: Fields with their pending AI proposals read as if accepted. Queries, Metabot and
  the query builder never use it. The proposals live in an EE table."
  (:require
   [medley.core :as m]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [metabase.warehouse-schema.user-settings :as user-settings]))

(set! *warn-on-reflection* true)

(defenterprise pending-ai-proposals
  "The pending AI proposals of the Fields in `field-ids`: maps of `:field_id`, `:attribute` (a key of
  [[user-settings/field-ai-columns]]), `:proposed_value`, `:reasoning` and `:confidence`. Without the
  `:data-sensitivity` feature this returns nil, and the preview read is the same as the normal read."
  metabase-enterprise.data-sensitivity.overlay
  [_field-ids]
  nil)

(def ^:private keyword-attributes
  "The attributes whose Field column holds a keyword, while a proposal holds its value as a string."
  #{:semantic_type :data_sensitivity})

(defn with-ai-proposal-previews
  "`fields` with each pending AI proposal read as if accepted, also over a human value. Each Field gets
  `:ai_proposals`, a map of attribute to `{:value :reasoning :confidence :conflict}`, where `:conflict` says that the
  proposal is over a human value. Without the `:data-sensitivity` feature this returns `fields` unchanged."
  [fields]
  (let [field-ids (into [] (keep :id) fields)
        proposals (when (seq field-ids) (pending-ai-proposals field-ids))]
    (if (nil? proposals)
      (vec fields)
      (let [by-field (group-by :field_id (filter #(contains? user-settings/field-ai-columns (:attribute %)) proposals))
            settings (m/index-by :field_id (warehouse-schema.db/field-user-settings-for-fields field-ids))]
        (mapv (fn [{:keys [id] :as field}]
                (let [user-set (user-settings/user-set-field-columns (settings id))]
                  (reduce (fn [field {:keys [attribute proposed_value reasoning confidence]}]
                            (-> field
                                (assoc attribute (cond-> proposed_value
                                                   (keyword-attributes attribute) keyword))
                                (assoc-in [:ai_proposals attribute] {:value      proposed_value
                                                                     :reasoning  reasoning
                                                                     :confidence (some-> confidence keyword)
                                                                     :conflict   (contains? user-set attribute)})))
                          (assoc field :ai_proposals {})
                          (by-field id))))
              fields)))))
