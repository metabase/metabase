(ns metabase-enterprise.dependencies.core
  "API namespace for the `metabase-enterprise.dependencies` module."
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.mbql-clause :as lib.schema.mbql-clause]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli :as mu]))

(defn- provider-with-updated-cards [base-provider cards]
  (-> base-provider
      lib.metadata.cached-provider/cached-metadata-provider
      (doto (lib.metadata.protocols/store-metadatas! (map #(dissoc % :result-metadata) cards)))))

(mu/defn check-cards-have-sound-refs :- [:map-of ::lib.schema.id/card [:sequential ::lib.schema.mbql-clause/clause]]
  "Given a list `updated-cards` of `:metadata/card`s which may have changes vs. AppDB, and a list `check-cards` of
  cards to check, return any bad clauses found in the `check-cards`.

  May return false positives: that is, if one of the `check-cards` has a bad ref in it, then it will be returned
  even if that bad ref has nothing to do with the `updated-cards`.

  Returns a map `{card-id [bad refs...]}`, which will be empty if there are no bad refs detected."
  [base-provider  :- ::lib.schema.metadata/metadata-provider
   updated-cards  :- [:sequential ::lib.schema.metadata/card]
   check-card-ids :- [:sequential ::lib.schema.id/card]]
  (let [provider (provider-with-updated-cards base-provider updated-cards)]
    (reduce (fn [errors card-id]
              (let [card     (lib.metadata/card provider card-id)
                    query    (lib/query provider (:dataset-query card))
                    bad-refs (lib/find-bad-refs query)]
                (cond-> errors
                  bad-refs (assoc (:id card) bad-refs))))
            {}
            check-card-ids)))

(comment
  ;; This should work on any fresh-ish Metabase instance; these are the built-in example questions.
  (let [card-ids [1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20
                  21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37]
        base-mp  #_{:clj-kondo/ignore [:unresolved-namespace]}
        (metabase.lib-be.metadata.jvm/application-database-metadata-provider 1)
        card     (lib.metadata/card base-mp 1)
        card'    (update-in card [:dataset-query :query :expressions]
                            ;; Replacing the expression Age with Duration - this breaks downstream uses!
                            update-keys (constantly "Duration"))]
    (check-cards-have-sound-refs base-mp [card'] card-ids)))
