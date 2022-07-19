---
title: Troubleshooting error messages
---

# Troubleshooting error messages

- [API error messages][api-error-message]
- [SQL error messages][sql-error-message]
- [Metabase error messages][metabase-error-message]

## [API error messages][discourse-search-api-error]

- Appear in red text when you load a dashboard or run a question.
- Contain a three-digit API error code, such as `400` or `404`.
- If your error message contains part of your SQL query, go to SQL error messages below.

## [SQL error messages][debugging-sql-syntax]

- Appear in red text when you run a question that uses the [SQL editor][sql-editor].
- Contain part of your SQL query, such as a column or table name.
- May also contain a three-digit API error code, such as `400` or `404`.

### Common SQL error messages

- [Column or table name is "not found" or "not recognized"][sql-error-not-found].
- [Function does not exist][sql-error-function-does-not-exist].
- [Permission denied to a table or schema][permission-denied].

## [Metabase error messages][discourse-search-metabase-error]

- Appear in gray text when you load a dashboard or run a question.

### Common Metabase error messages

- [Your question took too long](./timeout.html).

[api-error-message]: #api-error-messages
[debugging-sql-syntax]: /learn/debugging-sql/sql-syntax.html
[discourse-search-api-error]: https://discourse.metabase.com/search?q=api%20error%20message
[discourse-search-metabase-error]: https://discourse.metabase.com/search?q=metabase%20error%20message
[metabase-error-message]: #metabase-error-messages
[sql-editor]: /glossary/native_query_editor.html
[sql-error-function-does-not-exist]: /learn/debugging-sql/sql-syntax.html#sql-function-does-not-exist
[sql-error-message]: #sql-error-messages
[sql-error-not-found]: /learn/debugging-sql/sql-syntax.html#column-or-table-name-is-not-found-or-not-recognized
[permission-denied]: ./data-permissions#getting-a-permission-denied-error-message