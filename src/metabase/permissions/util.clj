(ns metabase.permissions.util
  "Utilities for working with permissions, particularly the permission paths which are stored in the DB. These should
  typically not be used outside of permissions-related namespaces such as `metabase.models.permissions`."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [metabase.util.malli :as mu]
   [metabase.util.regex :as u.regex]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    PATH CLASSIFICATION + VALIDATION                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(def path-char-rx
  "Regex for a valid character for a name that appears in a permissions path (e.g. a schema name or a Collection name).
  Character is valid if it is either:
    1. Any character other than a slash
    2. A forward slash, escaped by a backslash: `\\/`
    3. A backslash escaped by a backslash: `\\\\`"
  (u.regex/rx [:or #"[^\\/]" #"\\/" #"\\\\"]))

(def ^:private data-rx->data-kind
  {      #"db/\d+/"                                                                     :dk/db
   [:and #"db/\d+/" "native" "/"]                                                       :dk/db-native
   [:and #"db/\d+/" "schema" "/"]                                                       :dk/db-schema
   [:and #"db/\d+/" "schema" "/" path-char-rx "*" "/"]                                  :dk/db-schema-name
   [:and #"db/\d+/" "schema" "/" path-char-rx "*" "/table/\\d+/"]                       :dk/db-schema-name-and-table
   [:and #"db/\d+/" "schema" "/" path-char-rx "*" "/table/\\d+/" "read/"]               :dk/db-schema-name-table-and-read
   [:and #"db/\d+/" "schema" "/" path-char-rx "*" "/table/\\d+/" "query/"]              :dk/db-schema-name-table-and-query
   [:and #"db/\d+/" "schema" "/" path-char-rx "*" "/table/\\d+/" "query/" "segmented/"] :dk/db-schema-name-table-and-segmented})

(def ^:private DataKind (into [:enum] (vals data-rx->data-kind)))

;; *-permissions-rx
;;
;; The *-permissions-rx do not have anchors, since they get combined (and anchors placed around them) below. Take care
;; to use anchors where they make sense.

(def v1-data-permissions-rx
  "Paths starting with /db/ is a DATA ACCESS permissions path

  Paths that do not start with /db/ (e.g. /download/db/...) do not involve granting data access, and are not data-permissions.
  They are other kinds of paths, for example: see [[download-permissions-rx]]."
  (into [:or] (keys data-rx->data-kind)))

(def ^:private v2-data-permissions-rx [:and "data/" v1-data-permissions-rx])
(def ^:private v2-query-permissions-rx [:and "query/" v1-data-permissions-rx])

(def ^:private download-permissions-rx
  "Any path starting with /download/ is a DOWNLOAD permissions path
  /download/db/:id/         -> permissions to download 1M rows in query results
  /download/limited/db/:id/ -> permissions to download 1k rows in query results"
  [:and "download/" [:? "limited/"]
   [:and #"db/\d+/"
    [:? [:or "native/"
         [:and "schema/"
          [:? [:and path-char-rx "*/"
               [:? #"table/\d+/"]]]]]]]])

(def ^:private data-model-permissions-rx
  "Any path starting with /data-model/ is a DATA MODEL permissions path
  /download/db/:id/ -> permissions to access the data model for the DB"
  [:and "data-model/"
   [:and #"db/\d+/"
    [:? [:and "schema/"
         [:? [:and path-char-rx "*/"
              [:? #"table/\d+/"]]]]]]])

(def ^:private db-conn-details-permissions-rx
  "any path starting with /details/ is a DATABASE CONNECTION DETAILS permissions path
  /details/db/:id/ -> permissions to edit the connection details and settings for the DB"
  [:and "details/" #"db/\d+/"])

(def ^:private collection-permissions-rx
  [:and "collection/"
   [:or ;; /collection/:id/ -> readwrite perms for a specific Collection
    [:and #"\d+/"
     ;; /collection/:id/read/ -> read perms for a specific Collection
     [:? "read/"]]
    ;; /collection/root/ -> readwrite perms for the Root Collection
    [:and "root/"
     ;; /collection/root/read/ -> read perms for the Root Collection
     [:? "read/"]]
    ;; /collection/namespace/:namespace/root/ -> readwrite perms for 'Root' Collection in non-default
    ;; namespace (only really used for EE)
    [:and "namespace/" path-char-rx "+/root/"
     ;; /collection/namespace/:namespace/root/read/ -> read perms for 'Root' Collection in
     ;; non-default namespace
     [:? "read/"]]]])

(def ^:private non-scoped-permissions-rx
  "Any path starting with /application is a permissions that is not scoped by database or collection
  /application/setting/      -> permissions to access /admin/settings page
  /application/monitoring/   -> permissions to access tools, audit and troubleshooting
  /application/subscription/ -> permisisons to create/edit subscriptions and alerts"
  [:and "application/"
   [:or "setting/" "monitoring/" "subscription/"]])

(def ^:private block-permissions-rx
  "Any path starting with /block/ is for BLOCK aka anti-permissions.
  currently only supported at the DB level.
  e.g. /block/db/1/ => block collection-based access to Database 1"
  #"block/db/\d+/")

(def ^:private admin-permissions-rx "Root Permissions, i.e. for admin" "")

(def path-regex-v1
  "Regex for a valid permissions path. The [[metabase.util.regex/rx]] macro is used to make the big-and-hairy regex
  somewhat readable."
  (u.regex/rx
   "^/" [:or
         collection-permissions-rx
         non-scoped-permissions-rx
         admin-permissions-rx]
   "$"))

(def ^:private rx->kind
  [[(u.regex/rx "^/" v1-data-permissions-rx "$")         :data]
   [(u.regex/rx "^/" v2-data-permissions-rx "$")         :data-v2]
   [(u.regex/rx "^/" v2-query-permissions-rx "$")        :query-v2]
   [(u.regex/rx "^/" download-permissions-rx "$")        :download]
   [(u.regex/rx "^/" data-model-permissions-rx "$")      :data-model]
   [(u.regex/rx "^/" db-conn-details-permissions-rx "$") :db-conn-details]
   [(u.regex/rx "^/" collection-permissions-rx "$")      :collection]
   [(u.regex/rx "^/" non-scoped-permissions-rx "$")      :non-scoped]
   [(u.regex/rx "^/" block-permissions-rx "$")           :block]
   [(u.regex/rx "^/" admin-permissions-rx "$")           :admin]])

(def path-regex-v2
  "Regex for a valid permissions path. built with [[metabase.util.regex/rx]] to make the big-and-hairy regex somewhat readable.
  Will not match:
  - a v1 data path like \"/db/1\" or \"/db/1/\"
  - a block path like \"block/db/2/\""
  (u.regex/rx
   "^/" [:or
         v2-query-permissions-rx
         collection-permissions-rx
         non-scoped-permissions-rx
         admin-permissions-rx]
   "$"))

(def Path "A permission path."
  [:or {:title "Path"} [:re path-regex-v1] [:re path-regex-v2]])

(def ^:private Kind
  (into [:enum {:title "Kind"}] (map second rx->kind)))

(mu/defn classify-path :- Kind
  "Classifies a permission [[metabase.models.permissions/Path]] into a [[metabase.models.permissions/Kind]], or throws."
  [path :- Path]
  (let [result (keep (fn [[permission-rx kind]]
                       (when (re-matches (u.regex/rx permission-rx) path) kind))
                     rx->kind)]
    (when-not (= 1 (count result))
      (throw (ex-info (str "Unclassifiable path! " (pr-str {:path path :result result}))
                      {:path path :result result})))
    (first result)))

(def DataPath "A permissions path that's guaranteed to be a v1 data-permissions path"
  [:re (u.regex/rx "^/" v1-data-permissions-rx "$")])

(mu/defn classify-data-path :- DataKind
  "Classifies data path permissions [[metabase.models.permissions/DataPath]] into a [[metabase.models.permissions/DataKind]]"
  [data-path :- DataPath]
  (let [result (keep (fn [[data-rx kind]]
                       (when (re-matches (u.regex/rx [:and "^/" data-rx]) data-path) kind))
                     data-rx->data-kind)]
    (when-not (= 1 (count result))
      (throw (ex-info "Unclassified data path!!" {:data-path data-path :result result})))
    (first result)))

(let [path-validator (mc/validator Path)]
  (defn valid-path?
    "Is `path` a valid, known permissions path?"
    ^Boolean [^String path]
    (path-validator path)))

(def PathSchema
  "Schema for a permissions path with a valid format."
  [:re
   {:error/message "Valid permissions path"}
   (re-pattern (str "^/(" path-char-rx "*/)*$"))])

(let [path-format-validator (mc/validator PathSchema)]
  (defn valid-path-format?
    "Is `path` a string with a valid permissions path format? This is a less strict version of [[valid-path?]] which
  just checks that the path components contain alphanumeric characters or dashes, separated by slashes
  This should be used for schema validation in most places, to preserve downgradability when new permissions paths are
  added."
    ^Boolean [^String path]
    (path-format-validator path)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               PATH UTILS                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn escape-path-component
  "Escape slashes in something that might be passed as a string part of a permissions path (e.g. DB schema name or
  Collection name).

    (escape-path-component \"a/b\") ;-> \"a\\/b\""
  [s]
  (some-> s
          (str/replace #"\\" "\\\\\\\\")   ; \ -> \\
          (str/replace #"/" "\\\\/"))) ; / -> \/

(letfn [(delete [s to-delete] (str/replace s to-delete ""))
        (data-query-split [path] [(str "/data" path) (str "/query" path)])]
  (def ^:private data-kind->rewrite-fn
    "lookup table to generate v2 query + data permission from a v1 data permission."
    {:dk/db                                 data-query-split
     :dk/db-native                          (fn [path] (data-query-split (delete path "native/")))
     :dk/db-schema                          (fn [path] [(str "/data" (delete path "schema/")) (str "/query" path)])
     :dk/db-schema-name                     data-query-split
     :dk/db-schema-name-and-table           data-query-split
     :dk/db-schema-name-table-and-read      (constantly [])
     :dk/db-schema-name-table-and-query     (fn [path] (data-query-split (delete path "query/")))
     :dk/db-schema-name-table-and-segmented (fn [path] (data-query-split (delete path "query/segmented/")))}))

(mu/defn ->v2-path :- [:vector [:re path-regex-v2]]
  "Takes either a v1 or v2 path, and translates it into one or more v2 paths."
  [path :- [:or [:re path-regex-v1] [:re path-regex-v2]]]
  (let [kind (classify-path path)]
    (case kind
      :data (let [data-permission-kind (classify-data-path path)
                  rewrite-fn (data-kind->rewrite-fn data-permission-kind)]
              (rewrite-fn path))

      :admin ["/"]
      :block []

      ;; for sake of idempotency, v2 perm-paths should be unchanged.
      (:data-v2 :query-v2) [path]

      ;; other paths should be unchanged too.
      [path])))
