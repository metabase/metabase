(ns metabase.shadow-cljs-hooks
  "Build hooks for shadow-cljs. Conditionally adds EE CLJS entries
   when MB_EDITION=ee.")

(def ^:private ee-entries
  "EE CLJS entry points to include when building EE."
  '[metabase-enterprise.transforms-inspector.js])

(defn add-ee-entries
  "Shadow-cljs build hook that appends EE entries when MB_EDITION=ee."
  {:shadow.build/stage :configure}
  [build-state]
  (if (= "ee" (System/getenv "MB_EDITION"))
    (update-in build-state [:shadow.build/config :entries]
               into ee-entries)
    build-state))
