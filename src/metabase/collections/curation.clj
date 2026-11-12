(ns metabase.collections.curation
  "Canonical definition of \"curated\" content for Metabot's \"official content\" setting: content is curated exactly
  when it is official, i.e. it is a remote-synced collection or lives in one.")

(defn- as-bool
  "Coerce a raw boolean signal so only `true` or `1` count, since some drivers surface booleans as `0`/`1`."
  [v]
  (or (true? v) (= 1 v)))

(defn curated?
  "Whether the curation-signal map is curated, which is exactly when its `:official` signal is set."
  [{:keys [official]}]
  (as-bool official))

(defn curated-honeysql
  "HoneySQL mirror of [[curated?]], where `col` resolves the `:official` signal to a fragment of the target table."
  [col]
  [:coalesce [:is (col :official) true] false])
