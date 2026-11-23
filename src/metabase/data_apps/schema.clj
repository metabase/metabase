(ns metabase.data-apps.schema
  "Malli schemas for the data-apps module."
  (:require
   [clojure.string :as str]
   [malli.util :as mut]
   [metabase.actions.schema :as actions.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.test-spec :as lib.schema.test-spec]
   [metabase.models.schema :as models.schema]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(def max-bundle-bytes
  "Cap on a data app bundle's size (10 MiB)."
  (* 10 1024 1024))

(def ^:private reserved-slugs
  "Slugs that collide with literal `/api/ee/apps/*` sub-routes, so an app with one would be unreachable."
  #{"repo-status" "generate"})

(mr/def ::slug
  "A data app's slug: lowercase letters and numbers separated by single dashes, at most 100 characters."
  [:and
   {:error/message "must be lowercase letters, numbers, and dashes"}
   [:string {:max 100}]
   [:re #"^[a-z0-9]+(?:-[a-z0-9]+)*(?![\s\S])"]
   [:fn {:error/message "must not be a reserved slug"} (complement reserved-slugs)]])

(mr/def ::name
  "A data app's name, which people see."
  ms/NonBlankString)

(mr/def ::description
  "A data app's optional summary."
  [:maybe [:string {:max 255}]])

(mr/def ::version
  "The data app contract version an app was built for."
  [:int {:min 1}])

(mr/def ::bundle-path
  "The path of a data app's bundle, relative to the app's directory and inside it."
  [:and
   ms/NonBlankString
   [:fn {:error/message "must be relative to the app's directory and stay inside it"}
    #(and (not (str/starts-with? % "/"))
          (not (str/includes? % "\\"))
          (not-any? #{"" "." ".."} (str/split % #"/" -1)))]
   [:fn {:error/message "must not be the app's data_app.yaml"} #(not= "data_app.yaml" %)]])

(mr/def ::allowed-host
  "An origin a data app's sandboxed bundle may fetch: scheme, host with an optional `*.` subdomain wildcard, and an
   optional port."
  [:re
   {:error/message "must be an origin like https://api.example.com or https://*.example.com"}
   #"^https?://(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*(:\d+)?(?![\s\S])"])

(mr/def ::allowed-hosts
  "The origins a data app's sandboxed bundle may fetch."
  [:sequential ::allowed-host])

(mr/def ::bundle
  "A data app's bundle bytes."
  [:and
   bytes?
   [:fn {:error/message "must be less than 10 MiB"} #(<= (alength ^bytes %) max-bundle-bytes)]])

(mr/def ::bundle-text
  "The text of a data app's bundle file."
  [:string {:max max-bundle-bytes}])

(mr/def ::data-app
  "A DataApp as selected from the app DB: every column of `:data_app`."
  [:map {:closed true}
   [:id              ms/PositiveInt]
   [:entity_id       {:optional true} [:maybe :string]]
   [:slug            {:optional true} ::slug]
   [:name            {:optional true} ::name]
   [:allowed_hosts   {:optional true} ::allowed-hosts]
   [:bundle_path     {:optional true} ::bundle-path]
   [:bundle          {:optional true} [:maybe ::bundle]]
   [:bundle_hash     {:optional true} [:maybe :string]]
   [:enabled         {:optional true} [:maybe :boolean]]
   [:created_at      {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at      {:optional true} [:maybe ms/TemporalInstant]]
   [:description     {:optional true} ::description]
   [:version         {:optional true} ::version]
   [:resource_collection_id {:optional true} [:maybe ms/PositiveInt]]])

(mr/def ::data-app-preview
  "A data app's dev preview: the slug its manifest declares, whether or not the app exists on the instance."
  [:map {:closed true}
   [:slug :string]])

(mr/def ::data-app-info
  "What a data app's request is checked as: the app it names, or a dev preview of one, which has no ID."
  [:multi {:dispatch #(if (contains? % :id) :app :preview)}
   [:app     ::data-app]
   [:preview ::data-app-preview]])

(mr/def ::data-app.update
  "What an update of a DataApp takes, as a caller gives it, before the hooks of the model normalize it: the columns to
  change. The boundary of a write validates the values."
  [:map {:closed true}
   [:entity_id              {:optional true} [:maybe :string]]
   [:slug                   {:optional true} :string]
   [:name                   {:optional true} :string]
   [:allowed_hosts          {:optional true} [:maybe [:sequential :string]]]
   [:bundle_path            {:optional true} :string]
   [:bundle                 {:optional true} [:maybe [:or bytes? :string]]]
   [:enabled                {:optional true} [:maybe :boolean]]
   [:created_at             {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at             {:optional true} [:maybe ms/TemporalInstant]]
   [:description            {:optional true} [:maybe :string]]
   [:version                {:optional true} [:maybe :int]]
   [:resource_collection_id {:optional true} [:maybe ms/PositiveInt]]])

(mr/def ::data-app.update-row
  "What an update of a DataApp takes per row: its `:id` and the columns to change."
  [:merge
   [:map {:closed true}
    [:id ms/PositiveInt]]
   ::data-app.update])

(mr/def ::data-app.create
  "What creating a DataApp takes, as a caller gives it, before the hooks of the model normalize it: the columns of an
  update without the `:id`, and the slug, name and bundle path."
  [:merge
   ::data-app.update
   [:map
    [:slug        :string]
    [:name        :string]
    [:bundle_path :string]]])

(mr/def ::query-stage-spec
  "A stage of a Lib test query spec with only what a data app's question may hold, as the card hooks check it: a table
  source, and no joins or custom expressions."
  [:merge
   (mut/select-keys ::lib.schema.test-spec/test-stage-spec [:fields :filters :aggregations :breakouts :order-bys :limit])
   [:map {:closed true}
    [:source [:ref ::lib.schema.test-spec/test-table-source-spec]]]])

(mr/def ::query-spec
  "A Lib test query spec of a data app's question: one stage."
  [:map {:closed true}
   [:stages [:tuple [:ref ::query-stage-spec]]]])

(mr/def ::action-spec
  "An action of a data app: an implicit action of `kind` on a table."
  [:map {:closed true}
   [:kind  ::actions.schema/implicit-action.kind]
   [:table [:map {:closed true}
            [:id ::lib.schema.id/table]]]])

(mr/def ::external-data-app
  "A DataApp as serialization writes it, with portable references in place of ids, its bundle path under the key of its
  manifest, and its bundle as a resource file."
  [:schema {:registry lib.schema.id/external-registry}
   [:merge
    [:select-keys ::data-app [:entity_id :slug :name :description :version :allowed_hosts]]
    [:map {:closed true}
     [:serdes/meta {:optional true} ::models.schema/external-meta]
     [:collection       {:optional true} [:maybe ::lib.schema.id/collection]]
     [:path             {:optional true} ::bundle-path]
     [:serdes/resources {:optional true} [:map-of :string :string]]]]])
