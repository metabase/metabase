(ns metabase-enterprise.data-apps.schema
  "Malli schemas for the data-apps module."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.data-apps.query-definition :as query-definition]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(def max-bundle-bytes
  "Cap on a data app bundle's size (10 MiB)."
  (* 10 1024 1024))

(def ^:private reserved-slugs
  "Slugs that collide with literal `/api/apps/*` sub-routes, so an app with one would be unreachable."
  #{"generate" "repo-status" "sandbox-host"})

(defn- decoders
  "Schema properties decoding a value with `f` both in [[metabase.lib.core/normalize]] and at the API boundary."
  [f]
  {:decode/normalize f, :decode/api f})

(defn- trim [x]
  (cond-> x (string? x) str/trim))

(defn- one-line [x]
  (cond-> x (string? x) (-> (str/replace #"\s+" " ") str/trim not-empty)))

(defn- relative-path [x]
  (cond-> x (string? x) (-> str/trim (str/replace #"^\./" ""))))

(defn- origin [x]
  (cond-> x (string? x) (-> str/trim u/lower-case-en (str/replace #"/+$" ""))))

(defn- version-or-1 [x]
  (if (nil? x) 1 x))

(defn- distinct-vec [x]
  (cond-> x (nil? x) vec, (sequential? x) (-> distinct vec)))

(mr/def ::slug
  "A data app's slug: lowercase letters and numbers separated by single dashes, at most 100 characters."
  [:and
   {:error/message "must be lowercase letters, numbers, and dashes"}
   [:string {:max 100}]
   [:re #"\A[a-z0-9]+(?:-[a-z0-9]+)*\z"]
   [:fn {:error/message "must not be a reserved slug"} (complement reserved-slugs)]])

(mr/def ::display-name
  "A data app's display name."
  [:string (merge {:min 1} (decoders trim))])

(mr/def ::description
  "A data app's optional one-line summary, nil when blank."
  [:maybe (decoders one-line) [:string {:max 255}]])

(mr/def ::version
  "The data app contract version an app was built for, 1 when it declares none."
  [:int (merge {:min 1} (decoders version-or-1))])

(mr/def ::bundle-path
  "The path of a data app's bundle, relative to the app's directory and inside it."
  [:and
   (decoders relative-path)
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
   (merge {:error/message "must be an origin like https://api.example.com or https://*.example.com"}
          (decoders origin))
   #"\Ahttps?://(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*(:\d+)?\z"])

(mr/def ::allowed-hosts
  "The origins a data app's sandboxed bundle may fetch, `[]` when nil."
  [:sequential (decoders {:leave distinct-vec}) ::allowed-host])

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
  [:merge
   ::data-app.update
   [:map {:closed true}
    [:id              ms/PositiveInt]]])

(mr/def ::data-app.update
  "What an update (or insert) of a DataApp accepts: every column of `:data_app` except `id`, all optional."
  [:map {:closed true}
   [:entity_id       {:optional true} [:maybe :string]]
   [:name            {:optional true} ::slug]
   [:display_name    {:optional true} ::display-name]
   [:allowed_hosts   {:optional true} ::allowed-hosts]
   [:bundle_path     {:optional true} ::bundle-path]
   [:bundle          {:optional true} [:maybe ::bundle]]
   [:bundle_hash     {:optional true} [:maybe :string]]
   [:enabled         {:optional true} [:maybe :boolean]]
   [:created_at      {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at      {:optional true} [:maybe ms/TemporalInstant]]
   [:description     {:optional true} ::description]
   [:version         {:optional true} ::version]
   [:resource_collection_id {:optional true} [:maybe ms/PositiveInt]]
   [:permission_group_id    {:optional true} [:maybe ms/PositiveInt]]
   [:table_ids              {:optional true} [:maybe [:sequential ms/PositiveInt]]]])

(mr/def ::data-app.insert
  "What an insert of a DataApp accepts: [[::data-app.update]] with its slug, display name, and bundle path required."
  [:merge
   ::data-app.update
   [:map
    [:name         ::slug]
    [:display_name ::display-name]
    [:bundle_path  ::bundle-path]]])

(mr/def ::query
  "A data app `defineQuery` definition, with the name, entity ID and collection of the saved question that holds it."
  [:map {:closed true}
   [:name          ms/NonBlankString]
   [:query         ::query-definition/query-definition]
   [:entity_id     ms/NanoIdString]
   [:collection_id ms/NanoIdString]])

(mr/def ::action
  "An action without a model a data app runs, with the entity ID and collection of its copy."
  [:map {:closed true}
   [:action_id     ms/PositiveInt]
   [:entity_id     ms/NanoIdString]
   [:collection_id ms/NanoIdString]])

(mr/def ::file
  "A serialization file in the folder of the app's collection, or the error that stops it."
  [:or
   [:map {:closed true}
    [:file :string]
    [:yaml :string]]
   [:map {:closed true}
    [:error :string]]])

(mr/def ::app-request
  "What a new data app's files are generated from."
  [:map {:closed true}
   [:name ::display-name]
   [:slug {:optional true} [:maybe ::slug]]
   [:description {:optional true} ::description]])

(mr/def ::app-files
  "A new data app's files, each at its path from the repository root."
  [:map {:closed true}
   [:files [:sequential [:map {:closed true}
                         [:path :string]
                         [:yaml :string]]]]])
