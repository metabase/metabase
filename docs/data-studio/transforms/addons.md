---
title: Transform add-ons
---

# Transform add-ons

## Basic transforms

With basic transform functionality, you can create query-based transforms (either using SQL or the query builder) and schedule transforms to run periodically.

- **Self-hosted Metabases** (any plan): Basic transforms are included by default, for free. You don't need to add an add-on - just log into your Metabase and [enable transforms](../transforms/transforms-overview.md#enable)
- **Metabase Cloud**:

To add the Basic transforms to you

## Advanced transforms

Advanced transforms add-on

- [Query-based transforms]() - also included in [Basic transforms]()
- [Python transforms] -

## How billing works for transforms

Transforms - either basic transforms on Metabase Cloud, or advanced transforms are are billed based on the number of runs.

- Basic Transforms: SQL-based transforms with no advanced features. On Starter and Pro Cloud, your first 1,000 successful basic runs are free, then you're billed $0.01 per successful basic run. Basic Transforms are included on Open Source and paid self-hosted plans. Enterprise Cloud customers can use a prepaid package: $9K/year for up to 1M successful basic runs, with no rollover.
- Advanced Transforms: SQL or Python transforms with advanced features like writable connection, Transforms inspector, and the Python runner. On Starter and Pro Cloud, your first 1,000 successful advanced runs are free, then you're billed $0.02 per successful advanced run. On Pro self-hosted, your first 1,000 successful advanced runs are free, then you're billed $0.01 per successful advanced run. Enterprise Cloud customers can use a prepaid package: $18K/year for full Data Studio access with up to 1M successful advanced runs, with no rollover. Enterprise self-hosted customers can use a $9K/year platform fee with unlimited runs.

Cloud monthly and annual customers are billed each month based on the previous month's successful runs, with no annual discount on usage. If you upgrade to Advanced Transforms, all transform runs are billed as advanced runs going forward.
