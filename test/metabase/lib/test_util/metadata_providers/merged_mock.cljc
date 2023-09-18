(ns metabase.lib.test-util.metadata-providers.merged-mock
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util.metadata-providers.mock
    :as lib.tu.metadata-providers.mock]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs
   (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(defn- merge-metadatas [parent-metadata-provider fetch-metadata-fn metadatas]
  (mapv (fn [metadata]
          (merge (fetch-metadata-fn parent-metadata-provider (u/the-id metadata)) metadata))
        metadatas))

(def ^:private MergeableProperties
  [:map
   {:closed true}
   [:database {:optional true} [:maybe :map]]
   [:tables   {:optional true} [:maybe [:sequential [:map [:id ::lib.schema.id/table]]]]]
   [:fields   {:optional true} [:maybe [:sequential [:map [:id ::lib.schema.id/field]]]]]
   [:cards    {:optional true} [:maybe [:sequential [:map [:id ::lib.schema.id/card]]]]]
   [:metrics  {:optional true} [:maybe [:sequential [:map [:id ::lib.schema.id/metric]]]]]
   [:segments {:optional true} [:maybe [:sequential [:map [:id ::lib.schema.id/segment]]]]]])

(mu/defn ^:private merged-metadata-map :- lib.tu.metadata-providers.mock/MockMetadata
  [parent-metadata-provider :- lib.metadata/MetadataProvider
   properties               :- MergeableProperties]
  (into {}
        (map (fn [[object-type x]]
               [object-type
                (case object-type
                  :database (merge (lib.metadata/database parent-metadata-provider) x)
                  :tables   (merge-metadatas parent-metadata-provider lib.metadata/table x)
                  :fields   (merge-metadatas parent-metadata-provider lib.metadata/field x)
                  :cards    (merge-metadatas parent-metadata-provider lib.metadata/card x)
                  :metrics  (merge-metadatas parent-metadata-provider lib.metadata/metric x)
                  :segments (merge-metadatas parent-metadata-provider lib.metadata/segment x))]))
        properties))

(mu/defn merged-mock-metadata-provider :- lib.metadata/MetadataProvider
  "Takes a `parent-metadata-provider` and merges in the `properties` when you fetch specific objects, based on their
  `:id`. `properties` has the same syntax as [[mock-metadata-provider]]. This is useful if you want use existing data
  but mock specific properties, e.g. change the `:base-type` of a certain Field but otherwise use its existing
  metadata.

    (merged-mock-metadata-provider
     meta/metadata-provider
     {:fields [{:id        (meta/id :checkins :date)
                :base-type :type/TimeWithLocalTZ}]})"
  [parent-metadata-provider :- lib.metadata/MetadataProvider
   properties               :- MergeableProperties]
  (lib.tu.metadata-providers.mock/mock-metadata-provider
   parent-metadata-provider
   (merged-metadata-map parent-metadata-provider properties)))

(deftest ^:parallel merged-mock-metadata-provider-test
  (let [provider (merged-mock-metadata-provider
                  meta/metadata-provider
                  {:fields [{:id                (meta/id :reviews :rating)
                             :coercion-strategy :Coercion/UNIXMilliSeconds->DateTime
                             :effective-type    :type/Instant}]})]
    (is (=? {:id (meta/id)}
            (lib.metadata/database provider)))
    (is (=? {:id                (meta/id :reviews :rating)
             :name              "RATING"
             :base-type         :type/Integer
             :coercion-strategy :Coercion/UNIXMilliSeconds->DateTime
             :effective-type    :type/Instant}
            (lib.metadata/field provider (meta/id :reviews :rating))))))
