# Advanced caching controls

All Metabase editions include global caching controls. The Enterprise edition includes additional caching options that let you control caching for individual questions.

With Enterprise, you can override your default caching options for questions, caching the results for more or less time than the default time-to-live (TTL) duration set by your site-wide caching settings. Setting caching per question is especially useful when data relevant to the question has a different natural cadence than your site-wide caching rule, such as when the question queries data that doesn't change often.

To learn how to set caching preferences on individual questions, check out our [User's guide][caching].

For an overview of site-wide caching available to all Metabase editions, check out our [Adminstrator's guide][caching-admin].

[caching]: ../users-guide/06-sharing-answers.md#caching-results
[caching-admin]: ../administration-guide/14-caching.html