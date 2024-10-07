---
title: "User"
summary: |
  /api/user endpoints.
---

# User

/api/user endpoints.

## `DELETE /api/user/:id`

Disable a `User`.  This does not remove the `User` from the DB, but instead disables their account.

You must be a superuser to do this.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/user/`

Fetch a list of `Users` for admins or group managers.
  By default returns only active users for admins and only active users within groups that the group manager is managing for group managers.

   - If `status` is `deactivated`, include deactivated users only.
   - If `status` is `all`, include all users (active and inactive).
   - Also supports `include_deactivated`, which if true, is equivalent to `status=all`; If is false, is equivalent to `status=active`.
   `status` and `include_deactivated` requires superuser permissions.
   - `include_deactivated` is a legacy alias for `status` and will be removed in a future release, users are advised to use `status` for better support and flexibility.
   If both params are passed, `status` takes precedence.

  For users with segmented permissions, return only themselves.

  Takes `limit`, `offset` for pagination.
  Takes `query` for filtering on first name, last name, email.
  Also takes `group_id`, which filters on group id.

### PARAMS:

-  **`status`** nullable string.

-  **`query`** nullable string.

-  **`group_id`** nullable value must be an integer greater than zero.

-  **`include_deactivated`** nullable value must be a valid boolean string ('true' or 'false').

## `GET /api/user/:id`

Fetch a `User`. You must be fetching yourself *or* be a superuser *or* a Group Manager.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/user/current`

Fetch the current `User`.

## `GET /api/user/recipients`

Fetch a list of `Users`. Returns only active users. Meant for non-admins unlike GET /api/user.

   - If user-visibility is :all or the user is an admin, include all users.
   - If user-visibility is :group, include only users in the same group (excluding the all users group).
   - If user-visibility is :none or the user is sandboxed, include only themselves.

## `POST /api/user/`

Create a new `User`, return a 400 if the email address is already taken.

You must be a superuser to do this.

### PARAMS:

-  **`first_name`** nullable value must be a non-blank string.

-  **`last_name`** nullable value must be a non-blank string.

-  **`email`** value must be a valid email address.

-  **`user_group_memberships`** nullable sequence of map where {:id -> <value must be an integer greater than zero.>, :is_group_manager (optional) -> <boolean>}.

-  **`login_attributes`** nullable login attribute keys must be a keyword or string.

## `POST /api/user/:id/send_invite`

Resend the user invite email for a given user.

You must be a superuser to do this.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `PUT /api/user/:id`

Update an existing, active `User`.
  Self or superusers can update user info and groups.
  Group Managers can only add/remove users from groups they are manager of.

### PARAMS:

-  **`email`** nullable value must be a valid email address.

-  **`first_name`** nullable value must be a non-blank string.

-  **`is_group_manager`** nullable boolean.

-  **`locale`** nullable String must be a valid two-letter ISO language or language-country code e.g. en or en_US.

-  **`user_group_memberships`** nullable sequence of map where {:id -> <value must be an integer greater than zero.>, :is_group_manager (optional) -> <boolean>}.

-  **`id`** value must be an integer greater than zero.

-  **`is_superuser`** nullable boolean.

-  **`login_attributes`** nullable login attribute keys must be a keyword or string.

-  **`last_name`** nullable value must be a non-blank string.

## `PUT /api/user/:id/modal/:modal`

Indicate that a user has been informed about the vast intricacies of 'the' Query Builder.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`modal`**

## `PUT /api/user/:id/password`

Update a user's password.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`password`** password is too common.

-  **`old_password`** 

-  **`request`**

## `PUT /api/user/:id/reactivate`

Reactivate user at `:id`.

You must be a superuser to do this.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

---

[<< Back to API index](../api-documentation.md)