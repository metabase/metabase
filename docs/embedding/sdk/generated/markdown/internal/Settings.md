```ts
type Settings = InstanceSettings &
  PublicSettings &
  UserSettings &
  PrivilegedSettings;
```

Important distinction between `null` and `undefined` settings values.

* `null` means that the setting actually has a value of `null`.
* `undefined` means that the setting is not available in a certain context.

Further longer explanation:

Clojure doesn't have `undefined`. It uses `nil` to set (the default) value to (JS) `null`.
This can backfire on frontend if we are not aware of this distinction!

Do not use `undefined` when checking for a setting value! Use `null` instead.
Use `undefined` only when checking does the setting (key) exist in a certain context.

Contexts / Scopes:
Settings types are divided into contexts to make this more explicit:

* `PublicSettings` will always be available to everyone.
* `InstanceSettings` are settings that are available to all **authenticated** users.
* `AdminSettings` are settings that are available only to **admins**.
* `SettingsManagerSettings` are settings that are available only to **settings managers**.
* `UserSettings` are settings that are available only to **regular users**.

Each new scope is more strict than the previous one.

To further complicate things, there are two endpoints for fetching settings:

* `GET /api/setting` that *can only be used by admins!*
* `GET /api/session/properties` that can be used by any user, but some settings might be omitted (unavailable).

SettingsApi will return `403` for non-admins, while SessionApi will return `200`!
