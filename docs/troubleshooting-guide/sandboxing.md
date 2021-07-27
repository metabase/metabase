# Sandboxing

- Sandboxing means "giving some people access to only some data"
- Can be set up [graphically][sandboxing-your-data]
- Metabase runs a query that filters rows and/or selects a subset of columns
- The user's query then runs on that

So instead of:

```
select * from orders
where price > 100.00;
```

we create a [prepared statement][prepared-statement] as a replacement starting point for the query:

```
with temp01 as
  (select *
   from orders
   where orders.customer_id = {{user_id}})
select * from temp01
where price > 100.00;
```

where `user_id` is bound to an attribute from the user properties.

## Troubleshooting Process

### My question can't be sandboxed

1. Public questions can't be sandboxed: if someone doesn't have to log in to view the question, Metabase doesn't have user properties or group properties available for filtering the data and all results will be shown.

2. [Signed embedding][signed-embedding] will also show all results, but it's possible to control filtering with locked parameters.

3. Sandboxing doesn't work for non-SQL databases like MongoDB, Druid, or Google Analytics.

4. SQL questions do not have sandboxing, so any user with permissions to view the question can see all the results.

### My user can't see any of the data they're supposed to

1. Sandboxing relies on properties of the user record. If they logged in directly (with an account managed by Metabase) instead of using single sign-on, or vice versa, Metabase might not have the properties it's supposed to.

2. Admins usually restrict access to tables as part of sandboxing. If the restrictions are too tight by mistake (e.g., "no access" instead of "no SQL access") the user might not be able to see any data.

### I sandboxed my data but my users can still see it

1. If the Admin forgot to restrict access, the user can see the original table.

2. Sandboxing doesn't apply to queries written in SQL, so if a user has SQL access to a table, sandboxing won't restrict them. The solution is to turn off SQL access.

3. If users are logging in with single sign-on but the expected attributes aren't being saved and made available, sandboxing will deny access - see [Authenticating with SAML][authenticating-with-saml] for more on setup.

### I'm in a bunch of groups but can't see the sandboxed data

- We only allow [one sandbox per table][one-sandbox-per-table]: if someone is a member of two or more groups with different permissions, every rule for figuring out whether access should be allowed or not is very confusing. We therefore only allow one rule, which sometimes means the administrator will create a new group to capture precisely who's allowed access to what.

[authenticating-with-saml]: /docs/latest/enterprise-guide/authenticating-with-saml.html
[one-sandbox-per-table]: /docs/latest/enterprise-guide/data-sandboxes.html#a-user-can-only-have-one-sandbox-per-table
[prepared-statement]: /glossary.html#prepared-statement
[sandboxing-your-data]: /docs/latest/enterprise-guide/data-sandboxes.html
[signed-embedding]: /learn/embedding/embedding-charts-and-dashboards.html#enable-embedding-in-other-applications
