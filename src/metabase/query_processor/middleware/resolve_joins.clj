(ns metabase.query-processor.middleware.resolve-joins
  "Middleware that fetches tables that will need to be joined, referred to by `:field` clauses with `:source-field`
  options, and adds information to the query about what joins should be done and how they should be performed."
  (:refer-clojure :exclude [alias])
  (:require
   [clojure.string :as str]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.malli :as mu]
   [metabase.lib.schema.util :as lib.schema.util]
   [medley.core :as m]))

(mu/defn- resolve-join :- ::lib.schema.join/join
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path
   join  :- ::lib.schema.join/join]
  (merge
   {:strategy :left-join}
   join
   ;; this key is used just to tell [[metabase.lib.convert]] not to remove the default join alias e.g. `__join` upon
   ;; conversion back to legacy
   (when (str/starts-with? (:alias join) lib/legacy-default-join-alias)
     {:qp/keep-default-join-alias true})
   (when (= (:fields join) :all)
     (let [join-alias           (lib/current-join-alias join)
           join-last-stage-path (concat path [:stages (dec (count (:stages join)))])
           cols                 (lib.walk/apply-f-for-stage-at-path lib/returned-columns query join-last-stage-path)
           fields               (into
                                 []
                                 (comp (map #(lib/with-join-alias % join-alias))
                                       (map lib/ref)
                                       (m/distinct-by lib.schema.util/ref-distinct-key))
                                 cols)]
       {:fields fields}))))

(mu/defn- add-join-fields-to-stage :- [:maybe ::lib.schema/stage]
  [query  :- ::lib.schema/query
   path   :- ::lib.walk/path
   stage  :- ::lib.schema/stage]
  (when (and (seq (:fields stage))
             (seq (:joins stage)))
    (let [stage-cols (lib.walk/apply-f-for-stage-at-path lib/returned-columns query path)
          new-cols   (drop (count (:fields stage)) stage-cols)]
      (update stage :fields (fn [fields]
                              (into (vec fields)
                                    (map lib/ref)
                                    new-cols))))))

(mu/defn resolve-joins :- ::lib.schema/query
  "* Replace `:fields :all` inside joins with a sequence of field refs

  * Add default values for `:strategy`

  * Add join fields to parent stage `:fields` as needed."
  [query :- ::lib.schema/query]
  (lib.walk/walk
   query
   (fn [query path-type path stage-or-join]
     (case path-type
       :lib.walk/join  (resolve-join query path stage-or-join)
       :lib.walk/stage (add-join-fields-to-stage query path stage-or-join)))))
