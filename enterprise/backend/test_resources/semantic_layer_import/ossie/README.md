# Ossie fixtures

Apache Ossie semantic model documents the tests of `metabase-enterprise.semantic-layer-import.ossie` run through the
import, taken from public repositories as they were on 2026-11-02, unchanged apart from the file names noted below.
What each one is for is in the Ossie source's README (`enterprise/backend/src/metabase_enterprise/semantic_layer_import/ossie/README.md`,
"Fixtures and tests").

| Directory | Origin | License |
| -- | -- | -- |
| `tpch/tpch-revenue.osi.yaml`, `tpch/tpch-revenue.osi.v02.yaml` | [Snowflake-Labs/sfquickstarts](https://github.com/Snowflake-Labs/sfquickstarts) at 357e9269d304, `site/sfguides/src/getting-started-with-apache-osi/assets/`: one TPC-H revenue model in both document shapes, 0.1.1 and 0.2.0.dev0 | Apache-2.0 (the repository's `LICENSE`, a copy of which is `tpch/LICENSE`) |
| `tpch/tpch_sf0_001.edn` | Generated: TPC-H at scale factor 0.001, by DuckDB's `tpch` extension, as a test dataset definition for the end-to-end test. Regenerate with `metabase-enterprise.semantic-layer-import.ossie.test-util.tpch/regenerate!` | TPC-H is a benchmark specification of the TPC; the generated data carries no license text |
| `apache/compliance/portability/` | [apache/ossie](https://github.com/apache/ossie) at 10116f936e62, `compliance/portability/m0` to `m3`, flattened into one directory: the portability ladder, one construct per rung, in qualified and bare reference forms | Apache-2.0 (`apache/LICENSE`, `apache/NOTICE`) |
| `apache/compliance/scott/scott_model.ossie.yaml` | apache/ossie, `compliance/query/scott/`: the SCOTT schema with dataset-scoped metrics and a self-join | Apache-2.0 |
| `apache/examples/tpcds_semantic_model.yaml` | apache/ossie, `examples/`: the TPC-DS example, 0.2.0.dev0, with window-function metrics | Apache-2.0 |
| `apache/examples/tpcds_semantic_model.osi-0.1.1.yaml` | apache/ossie at tag `osi-0.1.1-rc1`, `examples/tpcds_semantic_model.yaml`: the same example in the 0.1.1 shape; renamed here to sit next to the other | Apache-2.0 |
| `apache/examples/renamed_fields.yaml` | apache/ossie, `examples/`: field names that differ from their source columns | Apache-2.0 |
| `duckdb_ossie/` | [iqea-ai/duckdb-ossie](https://github.com/iqea-ai/duckdb-ossie) at ba25e73b517b, `test/fixtures/` and `test/fixtures/invalid/`: documents another implementation refuses, and hostile-but-legal ones | MIT (`duckdb_ossie/LICENSE`) |
