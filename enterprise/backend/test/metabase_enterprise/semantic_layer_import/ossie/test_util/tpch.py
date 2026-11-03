"""TPC-H data for the Ossie source's end-to-end test, generated with DuckDB's `tpch` extension.

Run by metabase_enterprise.semantic_layer_import.ossie.test_util.tpch/regenerate! through `uv run --with duckdb`,
never on its own by the tests. Writes one JSON document to stdout:

    {"scale_factor": 0.001,
     "tables": [{"name": "region", "fields": [{"name": "r_regionkey", "type": "INTEGER"}, ...],
                 "rows": [[0, "AFRICA"], ...]}, ...],
     "net_revenue": "110433357.0881",
     "sf1_net_revenue": "164360931200.3961"}

The tables are the five the `tpch-revenue.osi.yaml` semantic model is defined over (region, nation, customer, orders,
lineitem), with the `*_comment` columns left out, since nothing refers to them and they are most of the bytes. Rows
are ordered by primary key so a regeneration's diff is only what changed. DECIMAL values are written as strings, so
their scale survives JSON; DATE values as ISO strings. `net_revenue` is the semantic model's net_revenue metric
computed with plain SQL over the generated lineitem, for the test to compare the imported metric against, and
`sf1_net_revenue` the same metric at scale factor 1, the number the TPC-H quickstart documents (164,360,931,200.40),
which the wrapper checks so that the formula and the data are known to be the real thing.
"""

import argparse
import datetime
import decimal
import json
import sys

import duckdb

TABLES = {
    "region": ["r_regionkey", "r_name"],
    "nation": ["n_nationkey", "n_name", "n_regionkey"],
    "customer": ["c_custkey", "c_name", "c_address", "c_nationkey", "c_phone", "c_acctbal", "c_mktsegment"],
    "orders": ["o_orderkey", "o_custkey", "o_orderstatus", "o_totalprice", "o_orderdate", "o_orderpriority",
               "o_clerk", "o_shippriority"],
    "lineitem": ["l_orderkey", "l_partkey", "l_suppkey", "l_linenumber", "l_quantity", "l_extendedprice",
                 "l_discount", "l_tax", "l_returnflag", "l_linestatus", "l_shipdate"],
}

ORDER_BY = {
    "region": "r_regionkey",
    "nation": "n_nationkey",
    "customer": "c_custkey",
    "orders": "o_orderkey",
    "lineitem": "l_orderkey, l_linenumber",
}

NET_REVENUE_SQL = (
    "SELECT sum(CASE WHEN l_returnflag <> 'R' THEN l_extendedprice * (1 - l_discount) ELSE 0 END) FROM lineitem"
)


def generate(sf):
    con = duckdb.connect()
    con.sql("INSTALL tpch; LOAD tpch;")
    con.sql(f"CALL dbgen(sf={sf})")
    return con


def encode(value):
    if isinstance(value, decimal.Decimal):
        return str(value)
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    return value


def table(con, name):
    columns = TABLES[name]
    types = {
        column_name: column_type
        for column_name, column_type in con.sql(
            "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = ?", params=[name]
        ).fetchall()
    }
    rows = con.sql(f"SELECT {', '.join(columns)} FROM {name} ORDER BY {ORDER_BY[name]}").fetchall()
    return {
        "name": name,
        "fields": [{"name": column, "type": types[column]} for column in columns],
        "rows": [[encode(v) for v in row] for row in rows],
    }


def net_revenue(con):
    return str(con.sql(NET_REVENUE_SQL).fetchall()[0][0])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sf", type=float, default=0.001)
    args = parser.parse_args()
    con = generate(args.sf)
    document = {
        "scale_factor": args.sf,
        "tables": [table(con, name) for name in TABLES],
        "net_revenue": net_revenue(con),
        "sf1_net_revenue": net_revenue(generate(1)),
    }
    json.dump(document, sys.stdout)


if __name__ == "__main__":
    main()
