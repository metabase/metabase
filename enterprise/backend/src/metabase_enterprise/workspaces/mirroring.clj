(ns metabase-enterprise.workspaces.mirroring)

;; we should have a test where we check that the table only contains mirrored-key + a known set of excludes
(def ^:private transform-mirrored-keys
  #{:description :name :source :target :source_type})

(defn mirror-entities!
  "TODO (lbrdnk): Add docstring."
  [workspace graph-ctx]
  (:graph (#_mirror-transforms! workspace graph-ctx)))
