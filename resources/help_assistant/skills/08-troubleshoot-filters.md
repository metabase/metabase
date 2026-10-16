---
id: troubleshoot-filters
title: Filters that don't work
description: Dashboard filters return no results or wrong results, or linked filters don't narrow each other's options.
references:
  - troubleshooting-guide/filters.md
  - troubleshooting-guide/linked-filters.md
  - dashboards/filters.md
---
1. Ask whether the cards are query builder questions or SQL questions; SQL questions need variables connected to the filter.
2. Check each card is wired to the filter on the dashboard.
3. For linked filters, explain that the columns must be connected by a foreign key relationship Metabase knows about.
