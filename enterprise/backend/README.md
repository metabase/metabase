### EE Code Structure Notes

Refer to the [Backend Module Organization
Guide](https://www.notion.so/metabase/Guide-to-Backend-Module-Organization-19169354c9018046ab46e4234aace905) for tips
on how to organize EE code.

### Naming EE API routes

To make things consistent EE-only API routes should be given `/ee/` route names that correspond to their module (i.e.,
are prefixed with `/ee/<module>/`). For example, an `:subscription-management`-only route to delete User subscriptions
should be named something like

```
DELETE /api/ee/subscription-management/user/:id/subscriptions
```

rather than

```
DELETE /api/user/:id/subscriptions
```

Not all EE endpoints follow this pattern yet, but they should; please feel free to fix stuff as you come across it if
I don't get to it first.

### Questions :interrobang:

Ping me (`@camsaul`) if you have any questions.
