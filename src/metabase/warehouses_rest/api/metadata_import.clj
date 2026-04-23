(ns metabase.warehouses-rest.api.metadata-import
  "Thin HTTP wrappers around the batch processors in `metabase.warehouses-rest.metadata-import-core`,
  driven by `metabase.warehouses-rest.api.ndjson-import/stream-import!` for NDJSON request/response
  framing and per-batch transactions.

  See `METADATA_IMPORT_API_CONTRACT.md` for the shape of the requests and responses."
  (:require
   [metabase.warehouses-rest.api.ndjson-import :as ndjson-import]
   [metabase.warehouses-rest.metadata-import-core :as core]))

(set! *warn-on-reflection* true)

(defn import-field-values-ndjson!
  "Read NDJSON `in`, upsert one `FieldValues` row per line on `field_id`, write NDJSON `out`."
  [^java.io.InputStream in ^java.io.OutputStream out]
  (ndjson-import/stream-import!
   in out core/import-batch-size
   (fn [batch buffer]
     (core/process-field-values-batch! batch buffer))))

(defn import-databases-ndjson!
  "Read NDJSON `in`, match each line against `:model/Database` by `(name, engine)`, write NDJSON
  `out` with `{old_id, new_id}` per line."
  [^java.io.InputStream in ^java.io.OutputStream out]
  (ndjson-import/stream-import!
   in out core/import-batch-size
   (fn [batch buffer]
     (doseq [[line-num line] batch]
       (core/process-databases-line! buffer line-num line)))))

(defn import-tables-ndjson!
  "Read NDJSON `in`, match/insert `:model/Table` rows, write NDJSON `out` with either
  `{old_id, existing_id}` or `{old_id, new_id}` per line."
  [^java.io.InputStream in ^java.io.OutputStream out]
  (ndjson-import/stream-import!
   in out core/import-batch-size
   (fn [batch buffer]
     (core/process-tables-batch! batch buffer))))

(defn import-fields-ndjson!
  "Read NDJSON `in`, insert fields with `is_defective_duplicate = true` (and `parent_id = NULL`,
  `fk_target_field_id = NULL`) so sibling nested fields don't collide on `idx_unique_field`. Write
  NDJSON `out` with either `{old_id, new_id}` or `{old_id, existing_id}` per line."
  [^java.io.InputStream in ^java.io.OutputStream out]
  (ndjson-import/stream-import!
   in out core/import-batch-size
   (fn [batch buffer]
     (core/process-fields-batch! batch buffer))))

(defn import-fields-finalize-ndjson!
  "Read NDJSON `in`, apply one batched UPDATE per batch setting `parent_id`, `fk_target_field_id`,
  and flipping `is_defective_duplicate = false`. Write NDJSON `out` with `{id, ok: true}` per line."
  [^java.io.InputStream in ^java.io.OutputStream out]
  (ndjson-import/stream-import!
   in out core/import-batch-size
   (fn [batch buffer]
     (core/process-finalize-batch! batch buffer))))
