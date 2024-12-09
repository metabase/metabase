---
title: "Configuration file"
---

# Configuration file

{% include plans-blockquote.html feature="Loading from a configuration file" self-hosted-only="true" %}

On self-hosted [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans, Metabase supports initialization on launch from a config file named `config.yml`. The config file should be located at:

- The current directory (the directory where the running Metabase JAR is located).
- The path specified by the `MB_CONFIG_FILE_PATH` [environment variable](./environment-variables.md).

The settings as defined in the config file work the same as if you set these settings in the Admin Settings in your Metabase. Settings defined in this configuration file will update any existing settings. If, for example, a database already exists (that is, you'd already added it via the initial set up or **Admin settings** > **Databases**, Metabase will update the database entry based on the data in the config file). Which means: if you define a setting in the config file, and then later change that setting in your Metabase application, keep in mind that the config file will overwrite that change whenever Metabase restarts.

The config file settings are NOT treated as a hardcoded source of truth (like [environment variables](./environment-variables.md) are). Settings set by environment variables cannot be changed, even in the Admin settings in the application itself.

## Example config template

See [Config template](./config-template.md).

## Config setup

The config file is split up into sections: `version` and `config.` Under `config`, you can specify:

- [Users](#users)
- [Databases](#databases)
- [Settings](#settings)

Like so:

```yml
version: 1
config:
  settings:
    - ...
  users:
    - ...
  databases:
    - ...
```

The config file must also include a `version` key, which is just a convenience field for you to help you keep track of your config file versions.

## Users

The first user created in a Metabase instance is an Admin. The first user listed in the config file may be designated an admin, but not necessarily. If someone has already spun up and logged into that Metabase for the first time, Metabase will make that first user an admin. Additionally, you can specify a user account as an admin by using the `is_superuser: true` key.

In the following example, assuming that the Metabase hasn't already been set up (which creates the first user) both users `first@example.com` and `admin@example.com` will be admins: `first@example.com` because it's the first user account on the list, and `admin@example.com` because that user has the `is_superuser` flag set to true.

```yml
version: 1
config:
  users:
    - first_name: First
      last_name: Person
      password: metabot1
      email: first@example.com
    - first_name: Normal
      last_name: Person
      password: metabot1
      email: normal@example.com
    - first_name: Admin
      last_name: Person
      password: metabot1
      is_superuser: true
      email: admin@example.com
```

If the Metabase has already been set up, then `first @example.com` will be loaded as a normal user.

## Databases

On a new Metabase, the example below sets up an admin user account and one database connection.

```yml
{% raw %}
version: 1
config:
  users:
    - first_name: Cam
      last_name: Era
      password: 2cans3cans4cans
      email: cam@example.com
  databases:
    - name: test-data (Postgres)
      engine: postgres
      details:
        host: localhost
        port: 5432
        user: dbuser
        password: "{{ env POSTGRES_TEST_DATA_PASSWORD }}"
        dbname: test-data
{% endraw %}
```

To determine which keys you can specify for a database, check out the fields available in Metabase itself for the database that you want to add.

### Setting up uploads on a database

You can also configure [uploads](../databases/uploads.md) in the config file with the following settings:

- `uploads_enabled`: Boolean
- `uploads_schema_name`: String
- `uploads_table_prefix`: String

Here's an example:

```yml
{% raw %}
version: 1
config:
  users:
    - first_name: Cam
      last_name: Era
      password: 2cans3cans4cans
      email: cam@example.com
  databases:
    - name: test-data (Postgres)
      engine: postgres
      details:
        host: localhost
        port: 5432
        user: dbuser
        password: "{{ env POSTGRES_TEST_DATA_PASSWORD }}"
        dbname: test-data
      uploads_enabled: true
      uploads_schema_name: uploads
      uploads_table_prefix: uploads_
{% endraw %}
```

See [Uploads](../databases/uploads.md).

## Referring to environment variables in the `config.yml`

As shown in the Databases examples above, environment variables can be specified with `{% raw %}{{ template-tags }}{% endraw %}` like `{% raw %}{{ env POSTGRES_TEST_DATA_PASSWORD }}{% endraw %}` or `{% raw %}[[options {{template-tags}}]]{% endraw %}`.

Metabase doesn't support recursive expansion, so if one of your environment variables references _another_ environment variable, you're going to have a bad time.

## Disable initial database sync

When loading a data model from a serialized export, you want to disable the scheduler so that the Metabase doesn't try to sync.

To disable the initial database sync, you can add `config-from-file-sync-database` to the `settings` list and set the value to `false`. The setting `config-from-file-sync-database` must come _before_ the databases list, like so:

```yml
version: 1
config:
  settings:
    config-from-file-sync-databases: false
  databases:
    - name: my-database
      engine: postgres
      details: ...
```

## Settings

In this config file, you can specify _any_ Admin setting.

In general, the settings you can set in the `settings` section of this config file map to the [environment variables](./environment-variables.md), so check them out to see which settings you can use in your config file. The actual key that you include in the config file differs slightly from the format used for environment variables. For environment variables, the form is in screaming snake case, prefixed by an `MB`:

```txt
MB_NAME_OF_VARIABLE
```

Whereas in the config file, you'd translate that to:

```txt
name-of-variable
```

So for example, if you wanted to specify the `MB_EMAIL_FROM_NAME` in the `config.yml` file:

```yml
version: 1
config:
  settings:
    config-from-file-sync-databases: false
    email-from-name: Stampy von Mails-a-lot
  databases:
    - name: my-database
      engine: h2
      details: ...
```

But you can set any of the Admin settings with the config file (for a list of settings, check out the [config file template](./config-template.md)). You can also browse the list of [environment variable](./environment-variables.md) to see what you can configure (though note that not all environment variables can be set via the config file.)

## Loading a new Metabase from a config file

Since loading from a config file is a Pro/Enterprise feature: for new installations, you'll need to supply Metabase with a token using the `MB_PREMIUM_EMBEDDING_TOKEN` environment variable.

```sh
MB_PREMIUM_EMBEDDING_TOKEN="[your token]" java --add-opens java.base/java.nio=ALL-UNNAMED -jar metabase.jar
```

## Further reading

- [Config file template](./config-template.md)
- [Environment variables](./environment-variables.md)
