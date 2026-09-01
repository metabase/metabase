(ns metabase-enterprise.stale.stale-queries
  "Query executors for the stale-content finder, built on [[metabase.app-db.hugsql]]. SQL lives in
  stale.sql. The rows are plain projections (`id` + `model`), not model instances -- they span two
  tables, so there is no single model to transform or instance them as."
  (:require
   [hugsql.core :as hugsql]
   [metabase.app-db.hugsql :as app-db.hugsql]
   [metabase.embedding.settings :as embed.settings]
   [metabase.settings.core :as setting]))

(set! *warn-on-reflection* true)

(declare stale-rows-sqlvec stale-total-sqlvec)

(hugsql/def-sqlvec-fns "metabase_enterprise/stale/stale.sql")

(defn- base-params
  "Params shared by both statements. Setting-driven toggles become int flags (see stale.sql for why
  int flags rather than `when` fragments). A `nil` in `collection-ids` means \"also match the root
  collection\", which the SQL takes as a separate flag rather than as a NULL in the IN list."
  [{:keys [collection-ids cutoff-date]}]
  {:cutoff-date             cutoff-date
   :embedding-on            (if (embed.settings/some-embedding-enabled?) 1 0)
   :public-sharing-on       (if (setting/get :enable-public-sharing) 1 0)
   :include-null-collection (if (contains? collection-ids nil) 1 0)
   :collection-ids          (app-db.hugsql/non-empty-in (remove nil? collection-ids))})

(defn stale-rows
  "Stale Card and Dashboard rows, sorted and paged: `[{:id 1 :model \"Card\"} ...]`.

  `limit`/`offset` are optional in the caller's schema but the statement always binds them (a
  parameterized `LIMIT`/`OFFSET` cannot be omitted the way a HoneySQL key can), so nil becomes
  \"no limit\" / \"no offset\" here."
  [{:keys [limit offset sort-column sort-direction] :as args}]
  (app-db.hugsql/rows nil stale-rows-sqlvec
                      (assoc (base-params args)
                             :sort-by-name (if (= :name sort-column) 1 0)
                             :ascending    (if (= :asc sort-direction) 1 0)
                             :limit        (or limit Integer/MAX_VALUE)
                             :offset       (or offset 0))))

(defn stale-total
  "Total number of stale Cards and Dashboards matching `args`, ignoring limit/offset."
  [args]
  (:count (app-db.hugsql/scalar nil stale-total-sqlvec (base-params args))))
