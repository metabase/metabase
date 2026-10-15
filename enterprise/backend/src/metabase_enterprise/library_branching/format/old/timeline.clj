(ns metabase-enterprise.library-branching.format.old.timeline
  "The old format of the kind `:timeline`. A stub: the tests of the kind come first.")

(set! *warn-on-reflection* true)

(defn decode
  "`{:skip reason}` of timeline document `doc`."
  [_doc _opts]
  {:skip :not-yet})
