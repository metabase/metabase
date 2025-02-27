# `sync` Module

The `sync` module is responsible for recording metadata (Tables, Fields, etc.) about connected data warehouses in the
app DB, which in turn is used to power the Query Builder and Query Processor.

This module also contains `/api/notify` endpoints (which are used to manually trigger re-syncs).
