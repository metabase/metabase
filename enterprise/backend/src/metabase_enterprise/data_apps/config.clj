(ns metabase-enterprise.data-apps.config
  "Parsing + validation of a per-app `data_app.yaml`, which sits in the app's own
   directory under `data_apps/` (see `README.md` in this directory for the layout):

     name: Sales dashboard      # display name
     description: Pipeline …    # optional — one line on what the app does
     path: dist/index.js        # bundle path, relative to this app's directory
     allowed_hosts:             # optional — origins the sandboxed bundle may fetch/XHR
       - https://api.example.com
       - https://*.internal.acme.com
     resource_collection_entity_id: abc123def456ghi789jkl
     permission_group_entity_id: abc123def456ghi789mno"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.yaml :as yaml])
  (:import
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

(def config-file-name
  "Name of the per-app config file (used in error messages)."
  "data_app.yaml")

(def apps-dir
  "Directory at the repo root that holds one subdirectory per data app."
  "data_apps")

(def ^:private slug-pattern
  "Lowercase letters/numbers separated by single dashes. An app *directory* must
   match this: the name is used verbatim as the slug, never normalized. Folding
   case here would reintroduce the collisions the directory naming rules out —
   git happily holds both `data_apps/Sales` and `data_apps/sales`."
  #"[a-z0-9]+(?:-[a-z0-9]+)*")

(def ^:private reserved-slugs
  "Slugs that collide with literal `/api/apps/*` sub-routes (see the API's
   `slug-regex`). An app with one of these would sync but be unreachable, so we
   reject it during parsing."
  #{"repo-status"})

(defn- normalize-path
  "Trim and drop a leading `./` so the path is relative to the app directory."
  [p]
  (-> (str p) str/trim (str/replace #"^\./" "")))

(defn- normalize-description
  "Trim and fold whitespace runs, so a YAML block scalar still stores as one line."
  [d]
  (-> (str d) str/trim (str/replace #"\s+" " ")))

(def ^:private max-description-chars
  "Cap on `description`. Checked here, not by the column type, so an over-long one fails just its own app."
  255)

(defn- parse-description
  "Validate + normalize the optional one-line `description`. Returns nil when it's
   absent or blank; throws a 400 when it's present but not a string — a YAML list or
   mapping would otherwise `str`-ify into Clojure collection syntax and sync as-is —
   or when it exceeds [[max-description-chars]]."
  [raw ^String dir]
  (when (some? raw)
    (when-not (string? raw)
      (throw (ex-info (tru "{0}/{1}: \"description\" must be a one-line string." dir config-file-name)
                      {:status-code 400})))
    (let [d (not-empty (normalize-description raw))]
      (when (and d (> (count d) max-description-chars))
        (throw (ex-info (tru "{0}/{1}: \"description\" is a one-line summary — it must be {2} characters or fewer."
                             dir config-file-name max-description-chars)
                        {:status-code 400})))
      d)))

(def ^:private allowed-host-re
  "A single `allowed_hosts` entry: an origin the app's sandboxed bundle may
   `fetch`/XHR — scheme + host, an optional `*.` subdomain wildcard, and an
   optional port. No path/query/`*`/non-http(s) scheme: it names an
   origin, e.g. `https://api.example.com` or `https://*.internal.acme.com`."
  #"(?i)https?://(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*(:\d+)?")

(defn- normalized-allowed-host
  "Trim, lowercase, and drop trailing slashes from one `allowed_hosts` entry."
  [entry]
  (some-> entry str str/trim u/lower-case-en (str/replace #"/+$" "")))

(defn- parse-allowed-host
  "Normalize + validate a single `allowed_hosts` entry (see [[allowed-host-re]]).
   Throws an `ex-info` with `:status-code` 400 when it isn't an origin-only value."
  [entry ^String dir]
  (let [s (normalized-allowed-host entry)]
    (when-not (and (seq s) (re-matches allowed-host-re s))
      (throw (ex-info (tru "{0}/{1}: \"{2}\" is not a valid allowed_hosts entry — use an origin like https://api.example.com or https://*.example.com."
                           dir config-file-name (str entry))
                      {:status-code 400})))
    s))

(defn- parse-allowed-hosts
  "Validate + normalize the optional `allowed_hosts` list from a parsed config.
   Each entry must be an origin-only value (see [[allowed-host-re]]); returns a
   lowercased, de-duplicated vector, or `[]` when the key is absent. Throws an
   `ex-info` with `:status-code` 400 on a non-list value or an invalid entry."
  [parsed ^String dir]
  (let [raw (:allowed_hosts parsed)]
    (cond
      (nil? raw) []
      (not (sequential? raw))
      (throw (ex-info (tru "{0}/{1}: \"allowed_hosts\" must be a list." dir config-file-name)
                      {:status-code 400}))
      :else
      (->> raw
           (map #(parse-allowed-host % dir))
           distinct
           vec))))

(defn- parse-entity-id
  "Validate one required portable entity ID from a data app manifest."
  [parsed key ^String dir]
  (let [value (some-> (get parsed key) str str/trim not-empty)]
    (when-not (and value (re-matches #"[-_0-9A-Za-z]{21}" value))
      (throw (ex-info (tru "{0}/{1}: \"{2}\" must be a 21-character entity ID."
                           dir config-file-name (name key))
                      {:status-code 400})))
    value))

(defn- path-traversal? [path]
  (some #(= ".." %) (str/split path #"/")))

(defn- parse-yaml [^bytes bytes ^String dir]
  (try
    (with-open [r (io/reader (ByteArrayInputStream. bytes) :encoding "UTF-8")]
      (yaml/parse-stream r))
    (catch Exception e
      (throw (ex-info (tru "Could not parse {0}/{1}: {2}" dir config-file-name (ex-message e))
                      {:status-code 400})))))

(defn dir-slug
  "The app's slug: the name of its directory (`data_apps/sales` -> `sales`). Used
   verbatim, never normalized. Public so discovery can label an app by its
   directory even when its `data_app.yaml` fails to parse (so a transiently broken
   config isn't treated as a removal)."
  [^String dir]
  (subs dir (inc (str/last-index-of dir "/"))))

(defn valid-slug?
  "Whether `slug` can name a data app directory and API route."
  [slug]
  (and (string? slug)
       (re-matches slug-pattern slug)
       (not (contains? reserved-slugs slug))))

(defn parse-app-config
  "Parse the bytes of one `data_app.yaml` from the app directory `dir` (e.g.
   `data_apps/sales`) into app metadata. The slug is the directory's name; `path`
   is relative to the directory; `:description` is an optional one-liner (nil
   when absent or blank, capped at [[max-description-chars]]); `:allowed_hosts`
   is a (possibly empty) vector of origins the sandboxed bundle may reach; the
   required resource entity IDs identify the collection and permissions group
   owned by the app. Throws an `ex-info` with `:status-code` 400 on malformed or
   incomplete content — including a directory whose name isn't a usable slug,
   since that app has no URL to be served at."
  [^bytes bytes ^String dir]
  (let [parsed        (parse-yaml bytes dir)
        slug          (dir-slug dir)
        name          (some-> (:name parsed) str str/trim not-empty)
        description   (parse-description (:description parsed) dir)
        path          (some-> (:path parsed) normalize-path not-empty)
        allowed-hosts (parse-allowed-hosts parsed dir)
        resource-collection-entity-id (parse-entity-id parsed :resource_collection_entity_id dir)
        permission-group-entity-id    (parse-entity-id parsed :permission_group_entity_id dir)]
    (when-not (re-matches slug-pattern slug)
      (throw (ex-info (tru "{0}: the app directory''s name is its slug, so it must be lowercase letters, numbers, and dashes." dir)
                      {:status-code 400})))
    (when (contains? reserved-slugs slug)
      (throw (ex-info (tru "{0}: \"{1}\" is a reserved slug — rename the directory." dir slug)
                      {:status-code 400})))
    (when-not name
      (throw (ex-info (tru "{0}/{1}: \"name\" is required." dir config-file-name)
                      {:status-code 400})))
    (when-not path
      (throw (ex-info (tru "{0}/{1}: \"path\" is required." dir config-file-name)
                      {:status-code 400})))
    (when (path-traversal? path)
      (throw (ex-info (tru "{0}/{1}: \"path\" must not contain \"..\"." dir config-file-name)
                      {:status-code 400})))
    {:slug                          slug
     :display_name                  name
     :description                   description
     :path                          path
     :allowed_hosts                 allowed-hosts
     :resource_collection_entity_id resource-collection-entity-id
     :permission_group_entity_id    permission-group-entity-id}))
