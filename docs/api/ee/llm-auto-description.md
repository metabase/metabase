---
title: "LLM Auto-description"
summary: |
  This feature is still in development.
---

# LLM Auto-description

This feature is still in development.

## `POST /api/ee/autodescribe/card/summarize`

Summarize a question.

### PARAMS:

-  **`visualization_settings`** Value must be a map.

-  **`parameters`** nullable sequence of parameter must be a map with :id and :type keys.

-  **`dataset`** nullable boolean.

-  **`description`** nullable value must be a non-blank string.

-  **`collection_position`** nullable value must be an integer greater than zero.

-  **`result_metadata`** nullable :metabase.analyze.query-results/ResultsMetadata.

-  **`collection_id`** nullable value must be an integer greater than zero.

-  **`cache_ttl`** nullable value must be an integer greater than zero.

-  **`dataset_query`** Value must be a map.

-  **`parameter_mappings`** nullable sequence of parameter_mapping must be a map with :parameter_id and :target keys.

-  **`display`** value must be a non-blank string.

## `POST /api/ee/autodescribe/dashboard/summarize/:id`

Provide a summary of a dashboard.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

---

[<< Back to API index](../../api-documentation.md)