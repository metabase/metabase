(ns metabase.transforms.audit
  "What the audit spec of a Transform needs beyond its columns.")

(set! *warn-on-reflection* true)

(defn details
  "The details to store for the Transform `row` beside its columns: how it runs, and its source without its body, and with
  only the Database of its query."
  [{:keys [source] :as row} _event]
  (merge (select-keys row [:run_trigger])
         {:source (-> source
                      (dissoc :body)
                      (update :query #(select-keys % [:database])))}))
