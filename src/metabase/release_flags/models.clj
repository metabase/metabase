(ns metabase.release-flags.models
  (:require
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ReleaseFlag [_model] :release_flag)

(methodical/defmethod t2/primary-keys :model/ReleaseFlag [_model] [:flag])

(doto :model/ReleaseFlag
  (derive :metabase/model))

(mu/defn all-flags :- [:map-of
                       :string
                       [:map
                        [:description [:maybe :string]]
                        [:start_date :any]
                        [:is_enabled :boolean]]]
  "Returns a map of flag name to its data (description, start_date, is_enabled)."
  []
  (into {}
        (map (fn [{:keys [flag] :as row}]
               [flag (dissoc row :flag)]))
        (t2/select :model/ReleaseFlag)))

(mu/defn update-statuses! :- [:map-of
                              :string
                              [:map
                               [:description [:maybe :string]]
                               [:start_date :any]
                               [:is_enabled :boolean]]]
  "Takes a map of flag name to enabled status and updates each flag's is_enabled accordingly."
  [statuses :- [:map-of :string :boolean]]
  (doseq [[flag enabled?] statuses]
    (t2/update! :model/ReleaseFlag :flag flag {:is_enabled enabled?})))

(mu/defn delete-flags! :- :int
  "Deletes the given set of flags from the release_flag table. Returns the number deleted."
  [flag-names :- [:set :string]]
  (if (seq flag-names)
    (t2/delete! :model/ReleaseFlag :flag [:in flag-names])
    0))

(mu/defn upsert-flag!
  "Inserts or updates a release flag with the given name, description, and start_date."
  [flag-name :- :string
   description :- [:maybe :string]
   start-date :- :any]
  (t2/with-transaction [_conn]
    (if (t2/exists? :model/ReleaseFlag :flag flag-name)
      (t2/update! :model/ReleaseFlag :flag flag-name
                  {:description description
                   :start_date start-date})
      (t2/insert! :model/ReleaseFlag {:flag        flag-name
                                      :description description
                                      :start_date  start-date}))))

(mu/defn has-release-flag? :- :boolean
  "Is this release flag enabled?
  If the release flag does not exist, we throw an exception."
  [flag :- [:or :keyword :string]]
  (if-some [status (t2/select-one-fn :is_enabled :model/ReleaseFlag :flag flag)]
    status
    (throw (ex-info (str "Release flag `" flag "` not found.")
                    {:flag flag}))))
