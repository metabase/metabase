## Sample Database (this dev instance)

Not the classic 4-table Sample Database — this instance's Sample Database has 8 tables under a
**"Piespace"** (pie-subscription SaaS) theme.

**Schema is `null` (schemaless) — CONFIRMED live against synced metadata, do not use `PUBLIC`.** Use
`[Sample Database, null, ORDERS, TOTAL]`, matching the `representations` repo's own example convention. (An
earlier version of this doc said `PUBLIC`, sourced from Metabase's own generic `test_resources` fixtures
rather than this instance's actual metadata — that was wrong for this instance. It went undetected until a
query using it actually ran through the QP; structural YAML validation doesn't catch it since a `[db,
schema, table]` tuple with the wrong schema still round-trips as *some* table, just not the one you meant.)

**Known trap: stale inactive duplicate tables with `schema: "PUBLIC"`.** This appdb has leftover inactive
duplicate rows — `ORDERS` id 203 (3 fields) and `PEOPLE` id 204 (2 fields), both `active: false`, both
`schema: "PUBLIC"` — alongside the real active ones (`schema: nil`). Table-name+schema lookup during import
does **not** filter by `active`, so a field ref written with schema `PUBLIC` silently resolves to one of
these broken duplicates instead of erroring — the query then fails deep in the QP (e.g. `add-implicit-fields`:
"Table 'PEOPLE' has no Fields associated with it") rather than at import time, which makes it a confusing
failure to debug. If a query error mentions a table having no/too-few fields, check for a stale
`active: false` duplicate with the same name before assuming your MBQL shape is wrong:
```clojure
(toucan2.core/select :model/Table :name "SOME_TABLE")   ; look for more than one row
```

| Table | `entity_type` | Description |
|---|---|---|
| **ORDERS** | `entity/TransactionTable` | Confirmed orders for a product, from a user. Join to Products/People via ID fields; `discount` null if not applicable. |
| **PRODUCTS** | `entity/ProductTable` | Catalog of products ever sold. `rating` is an integer 1–5. |
| **PEOPLE** | `entity/UserTable` | User accounts registered with Sample Company. Employees/support staff have accounts too. |
| **REVIEWS** | `entity/GenericTable` | Customer reviews on products — **not tied to orders**; people may review things they never bought. |
| **ACCOUNTS** | `entity/UserTable` | Customer accounts/organizations signed up for "on-demand pies." Two-week trial; null `Canceled At` = still paying. |
| **INVOICES** | `entity/GenericTable` | Confirmed payments from Piespace customers, mostly monthly. Group by Account ID for total paid to date. |
| **FEEDBACK** | `entity/GenericTable` | Feedback submitted with each pie order. Not every account submits it. |
| **ANALYTIC_EVENTS** | `entity/EventTable` | Anonymous usage-analytics events. Some events may be timestamped in the future — a deliberate data quirk, not a bug; watch for it in temporal analysis. |

### Columns (confirmed from real queries/segments/measures — not necessarily exhaustive)

- **ORDERS**: `ID`, `USER_ID`, `PRODUCT_ID`, `SUBTOTAL`, `TAX`, `TOTAL`, `DISCOUNT`, `QUANTITY`, `CREATED_AT`
- **PRODUCTS**: `ID`, `CATEGORY`, `TITLE`, `VENDOR`, `PRICE`, `RATING`, `EAN`, `CREATED_AT`
- **PEOPLE**: `ID`, `NAME`, `EMAIL`, `PASSWORD`, `ADDRESS`, `CITY`, `STATE`, `ZIP`, `LATITUDE`, `LONGITUDE`, `SOURCE`, `BIRTH_DATE`, `CREATED_AT`
- **ACCOUNTS**: only `ID`, `EMAIL` confirmed — rest unverified.
- **REVIEWS, INVOICES, FEEDBACK, ANALYTIC_EVENTS**: no field-level references found yet in available
  examples/fixtures. Verify against live synced metadata before referencing specific columns, e.g.:
  ```clojure
  (let [db (toucan2.core/select-one :model/Database :name "Sample Database")
        table (toucan2.core/select-one :model/Table :db_id (:id db) :name "REVIEWS")]
    (toucan2.core/select [:model/Field :name :base_type :semantic_type :fk_target_field_id]
                          :table_id (:id table) {:order-by [:position]}))
  ```

### Known/inferred relationships

- `ORDERS.PRODUCT_ID → PRODUCTS.ID`
- `ORDERS.USER_ID → PEOPLE.ID`
- Reviews/Accounts/Invoices/Feedback/Analytic Events likely FK to Products/Accounts per their descriptions,
  but no confirmed FK reference seen yet — verify via `fk_target_field_id` (query above) before relying on
  it in a query.
