(ns metabase.premium-features.db
  "Application database queries for `:model/PremiumFeaturesCache`. Every function here is a direct Toucan 2 call with
  no additional logic, so no other namespace runs a PremiumFeaturesCache query itself.

  The queries below follow [[::opts]]; queries that do not fit it live in the premium-features-only section at the
  bottom of this namespace."
  (:require
   [metabase.premium-features.schema :as premium-features.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(mr/def ::filters
  "Which PremiumFeaturesCache rows a query applies to. Keys mirror the columns of `premium_features_token_cache`: a
  scalar matches that value."
  [:map {:closed true}
   [:token_hash {:optional true} :string]])

(mr/def ::opts
  "The filters above plus the columns to select."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns {:optional true} [:sequential ::premium-features.schema/premium-features-cache.column]]]])

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/PremiumFeaturesCache columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts))

(defn- ->kv-args
  [opts]
  (u.query/opts->kv-args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-one-premium-features-cache :- [:maybe ::premium-features.schema/premium-features-cache.partial]
  "The first PremiumFeaturesCache matching `opts`, or nil."
  ([]
   (select-one-premium-features-cache nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select-one (->model columns) (->args opts))))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-premium-features-cache! :- :int
  "Insert the PremiumFeaturesCache `row`, returning the number inserted."
  [row :- ::premium-features.schema/premium-features-cache.create]
  (t2/insert! :model/PremiumFeaturesCache row))

(mu/defn update-premium-features-caches! :- :int
  "Apply `changes` to every PremiumFeaturesCache matching `opts`, returning the number updated."
  [opts    :- [:maybe ::opts]
   changes :- ::premium-features.schema/premium-features-cache.update]
  (apply t2/update! :model/PremiumFeaturesCache (conj (->kv-args opts) changes)))

(mu/defn delete-premium-features-caches! :- :int
  "Delete every PremiumFeaturesCache matching `opts`, returning the number deleted."
  [opts :- [:maybe ::opts]]
  (apply t2/delete! :model/PremiumFeaturesCache (->args opts)))

;;; ---------------------------------- Queries used only by the premium-features module ----------------------------------

(mu/defn active-personal-user-count
  "The number of active personal Users."
  []
  ;; Because this count is needed *during* token checks, it uses `t2/table-name` to avoid the `after-select` method on
  ;; users, which calls an EE method that needs ... a token check :|
  (t2/count (t2/table-name :model/User) :is_active true, :type "personal"))
