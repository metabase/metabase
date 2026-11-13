---
title: Database feature support
summary: Which Metabase features each officially supported database can use, from joins and custom expressions to uploads, actions, and permissions.
---

# Database feature support

_This documentation was generated from source by running:_

```
clojure -M:ee:drivers:doc driver-features-documentation
```

Some Metabase features depend on what your database can do. The tables below list which [officially supported databases](./connecting.md#connecting-to-supported-databases) can use which features.

- ✅: Metabase supports the feature on this database.
- ❌: Metabase doesn't support the feature on this database.
- ✅ (1): Metabase supports the feature on some versions or editions of this database. Check the numbered note below the table.

A ✅ means that Metabase can use the feature with this database, not that the feature is on. Some features have other requirements. For example, uploads and actions need a connection with write access, and some features are only available on [Pro and Enterprise plans](https://www.metabase.com/pricing/). Check the docs for each feature.

For databases that aren't on this page, check out [Community drivers](../developers-guide/community-drivers.md).
