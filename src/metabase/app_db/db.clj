(ns metabase.app-db.db
  "Application database queries for the app-db module's encryption and setting storage. Every function here is a direct
  Toucan 2 call with no additional logic, so no other namespace in the module runs a query itself -- except the custom
  migrations, which keep their own, frozen at the version they shipped in. Every write is a plain `t2/query` rather
  than a Toucan DML statement: the cloud-migration guard on Toucan DML reads `read-only-mode` through the Setting model
  first, and while rows are being re-encrypted a setting row can be plaintext under a key, or ciphertext under a key
  not yet in effect, which that model's strict read rejects."
  (:require
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn current-timestamp-string
  "The application DB's own current timestamp, as a string, for app DB type `db-type`."
  ^String [db-type :- [:enum :h2 :mysql :postgres]]
  ;; for MySQL, cast(current_timestamp AS char); for H2 & Postgres, cast(current_timestamp AS text)
  (let [cast-form (h2x/cast (if (= db-type :mysql) :char :text) (h2x/current-datetime-honeysql-form db-type))]
    (:timestamp (t2/query-one {:select [[cast-form :timestamp]]}))))

;;; ------------------------------------------------ Liquibase ------------------------------------------------

(mu/defn changelog-by-id
  "The Liquibase changelog row with `changelog-id` in the app DB of type `db-type`, or nil."
  [db-type      :- [:enum :h2 :mysql :postgres]
   changelog-id :- :string]
  (let [table-name (case db-type
                     (:postgres :h2) "databasechangelog"
                     :mysql          "DATABASECHANGELOG")]
    (t2/query-one [(format "select * from %s where id = ?" table-name) changelog-id])))

;;; ------------------------------------------------ Settings ------------------------------------------------

(def ^:private unmigrated-settings-where
  [:and [:= :value_with_aad nil] [:not= :value nil] [:not= :value ""]])

(mu/defn setting-value
  "The legacy `value` of the setting row with `setting-key`, or nil."
  [setting-key :- :string]
  (t2/select-one-fn :value :setting :key setting-key))

(mu/defn settings
  "Every setting row, raw."
  []
  (t2/select :setting))

(mu/defn reducible-setting-values-with-aad
  "A reducible of the key and `value_with_aad` of every setting row that has one."
  []
  (t2/reducible-select [:setting :key :value_with_aad] {:where [:!= :value_with_aad nil]}))

(mu/defn unmigrated-settings?
  "Whether any setting row has a non-blank `value` but no `value_with_aad`."
  []
  (t2/exists? :setting {:where unmigrated-settings-where}))

(mu/defn unmigrated-settings
  "Every setting row with a non-blank `value` but no `value_with_aad`, locked for update."
  []
  (t2/select :setting {:where unmigrated-settings-where, :for :update}))

(mu/defn insert-setting!
  "Insert a setting row for `setting-key` holding `value` and `value-with-aad`, returning the number inserted (as a
  one-element sequence -- `t2/query` on an INSERT, unlike `t2/insert!`, does not unwrap it)."
  [setting-key    :- :string
   value          :- [:maybe :string]
   value-with-aad :- [:maybe :string]]
  (t2/query {:insert-into :setting
             :values      [{:key setting-key, :value value, :value_with_aad value-with-aad}]}))

(mu/defn update-setting-values!
  "Set the columns in `changes` -- `:value` and/or `:value_with_aad`, nil writing NULL -- of the setting row with
  `setting-key`, returning the number updated (as a one-element sequence -- `t2/query` on an UPDATE, unlike
  `t2/update!`, does not unwrap it)."
  [setting-key :- :string
   changes     :- [:map {:closed true}
                   [:value          {:optional true} [:maybe :string]]
                   [:value_with_aad {:optional true} [:maybe :string]]]]
  (t2/query {:update :setting
             :set    (select-keys changes [:value :value_with_aad])
             :where  [:= :key setting-key]}))

(mu/defn delete-setting!
  "Delete the setting row with `setting-key`, returning the number deleted (as a one-element sequence -- `t2/query`
  on a DELETE, unlike `t2/delete!`, does not unwrap it)."
  [setting-key :- :string]
  (t2/query {:delete-from :setting, :where [:= :key setting-key]}))

(mu/defn reducible-column-values
  "A reducible of the id and `column` value of every row of `table`."
  [table  :- :keyword
   column :- :keyword]
  (t2/reducible-select [table :id [column :value]]))

(mu/defn update-column-value!
  "Set `column` of the row of `table` with `id` to `value`, returning the number updated (as a one-element
  sequence -- `t2/query` on an UPDATE, unlike `t2/update!`, does not unwrap it)."
  [table  :- :keyword
   column :- :keyword
   id     :- ms/PositiveInt
   value  :- [:maybe [:or :string bytes?]]]
  (t2/query {:update table, :set {column value}, :where [:= :id id]}))

(mu/defn delete-query-cache!
  "Delete every cached query result, returning the number deleted (as a one-element sequence -- `t2/query` on a
  DELETE, unlike `t2/delete!`, does not unwrap it)."
  []
  (t2/query {:delete-from :query_cache}))

;;; --------------------------------------------- Worktree schema ---------------------------------------------

(mu/defn worktree-schema-exists? :- :boolean
  "Whether the Postgres app DB has the worktree schema."
  []
  (boolean (t2/query-one ["SELECT 1 FROM pg_namespace WHERE nspname = 'worktree'"])))

(mu/defn create-worktree-schema! :- :any
  "Create the worktree schema of the Postgres app DB, empty, unless it exists."
  []
  (t2/query ["CREATE SCHEMA IF NOT EXISTS worktree"]))

(mu/defn drop-worktree-schema! :- :any
  "Drop the worktree schema of the Postgres app DB with its views, if it exists."
  []
  (t2/query ["DROP SCHEMA IF EXISTS worktree CASCADE"]))

(mu/defn execute-statement! :- :any
  "Run the SQL statement `statement`, which takes no parameters."
  [statement :- :string]
  (t2/query [statement]))

(mu/defn set-search-path! :- :string
  "Set the `search_path` of the connection to `search-path` until the transaction ends, and return the one before."
  [search-path :- :string]
  (let [before (:search_path (t2/query-one ["SELECT current_setting('search_path') AS search_path"]))]
    (t2/query ["SELECT set_config('search_path', ?, true)" search-path])
    before))

(mu/defn worktree-table-view-statements :- [:sequential :string]
  "The statements creating the view of each table of `public` with `worktree_id`, but the partitions, in the worktree
  schema: of the rows of the connection's worktree, refusing writes of another worktree's rows."
  []
  (mapv :statement
        (t2/query ["SELECT format('CREATE VIEW worktree.%1$I AS SELECT * FROM public.%1$I
                                   WHERE worktree_id = metabase_worktree_id() WITH CASCADED CHECK OPTION', c.relname)
                             AS statement
                      FROM pg_class c
                      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'worktree_id' AND NOT a.attisdropped
                     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND NOT c.relispartition
                     ORDER BY c.relname"])))

(mu/defn worktree-overlay-statements :- [:sequential :string]
  "The statements creating the view of `table`, whose rows belong to the main app, in the worktree schema over its
  `overlay`: the view, the defaults of the columns a statement can write, and the trigger function and trigger that
  write an insert, an update of the columns it changes, or a delete onto the stored rows."
  [table   :- :string
   overlay :- :string]
  (into []
        (mapcat #(map :statement (t2/query %)))
        [["SELECT format('CREATE VIEW worktree.%I AS SELECT * FROM public.%I', ?::text, ?::text) AS statement"
          table overlay]
         ["SELECT format('ALTER VIEW worktree.%I ALTER COLUMN %I SET DEFAULT %s', ?::text, a.attname,
                         CASE WHEN a.attidentity <> ''
                              THEN format('nextval(%L)', pg_get_serial_sequence(format('public.%I', ?::text), a.attname))
                              ELSE pg_get_expr(d.adbin, d.adrelid) END) AS statement
             FROM pg_attribute a
             LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
            WHERE a.attrelid = format('public.%I', ?::text)::regclass AND a.attnum > 0 AND NOT a.attisdropped
              AND a.attgenerated = '' AND (d.oid IS NOT NULL OR a.attidentity <> '')
            ORDER BY a.attnum"
          table table table]
         ["SELECT format($f$CREATE FUNCTION worktree.%1$I() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN
                             IF TG_OP = 'INSERT' THEN
                               INSERT INTO public.%2$I (%3$s) VALUES (%4$s) RETURNING %5$s INTO new; RETURN new;
                             ELSIF TG_OP = 'UPDATE' THEN
                               UPDATE public.%2$I SET %6$s WHERE id = old.id; RETURN new;
                             ELSE
                               DELETE FROM public.%2$I WHERE id = old.id; RETURN old;
                             END IF; END $fn$$f$,
                         'write_' || ?::text, ?::text, w.listed, w.inserted, v.returned, w.updated) AS statement
             FROM (SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) AS listed,
                          string_agg('new.' || quote_ident(attname), ', ' ORDER BY attnum) AS inserted,
                          string_agg(format('%1$I = CASE WHEN new.%1$I IS DISTINCT FROM old.%1$I THEN new.%1$I ELSE %1$I END',
                                            attname), ', ' ORDER BY attnum) AS updated
                     FROM pg_attribute
                    WHERE attrelid = format('public.%I', ?::text)::regclass AND attnum > 0 AND NOT attisdropped
                      AND attgenerated = '') w,
                  (SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) AS returned
                     FROM pg_attribute
                    WHERE attrelid = format('public.%I', ?::text)::regclass AND attnum > 0 AND NOT attisdropped) v"
          table table table overlay]
         ["SELECT format('CREATE TRIGGER write_stored_row INSTEAD OF INSERT OR UPDATE OR DELETE ON worktree.%I
                          FOR EACH ROW EXECUTE FUNCTION worktree.%I()', ?::text, 'write_' || ?::text) AS statement"
          table table]]))

(mu/defn worktree-public-view-statements :- [:sequential [:map [:relname :string] [:statement :string] [:reads :any]]]
  "The views of `public` but the `overlays`, each with the statement creating it in the worktree schema from its
  definition as `search_path` `public` prints it, and the views of `public` it reads."
  [overlays :- [:sequential :string]]
  (let [before (set-search-path! "public")]
    (try
      (t2/query ["SELECT c.relname, format('CREATE VIEW worktree.%I AS %s', c.relname, pg_get_viewdef(c.oid)) AS statement,
                         ARRAY(SELECT DISTINCT ref.relname::text
                                 FROM pg_rewrite rw
                                 JOIN pg_depend d ON d.classid = 'pg_rewrite'::regclass AND d.objid = rw.oid
                                 JOIN pg_class ref ON ref.oid = d.refobjid
                                WHERE rw.ev_class = c.oid AND ref.oid <> c.oid AND ref.relkind = 'v'
                                  AND ref.relnamespace = 'public'::regnamespace AND NOT ref.relname = ANY (?)) AS reads
                    FROM pg_class c
                   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'v' AND NOT c.relname = ANY (?)
                   ORDER BY c.relname"
                 (into-array String overlays)
                 (into-array String overlays)])
      (finally
        (set-search-path! before)))))
