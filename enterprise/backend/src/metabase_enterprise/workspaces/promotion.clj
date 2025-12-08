(ns metabase-enterprise.workspaces.promotion
  "Functionality for promoting workspace transforms back to main Metabase."
  (:require
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn promote-transforms!
  "Promote all transforms in a workspace back to main Metabase.

   This will:
   1. Get all workspace transforms
   2. Order them by dependencies (using the workspace graph)
   3. For each transform:
      - Find the original transform
      - Update it with the workspace version's definition
      - Re-execute it in the original schema (Chris: what? definitely don't do this!)

   Returns a map with:
   - :promoted - sequence of {:id, :name} maps
   - :errors - any transforms that failed to promote"
  [ws]
  (log/infof "Starting promotion of transforms from workspace %s" (:id ws)))
