---
title: "Configuration file"
---

# Configuration file

{% include plans-blockquote.html feature="Loading from a configuration file" self-hosted-only="true" %}

On some paid, self-hosted plans, Metabase supports initialization on launch from a config file named `config.yml`. This file should either be in the current directory (the directory where the running Metabase JAR is located), or in a path specified by the `MB_CONFIG_FILE_PATH` [environment variable](./environment-variables.md). In this config file, you can specify:

- Settings
- Users
- Databases

The settings as defined in the config file work the same as if you set these settings in the Admin Settings in your Metabase. Settings defined in this configuration file will update any existing settings. If, for example, a database already exists (that is, you'd already added it via initial set up or **Admin settings** > **Databases**, Metabase will update the database entry based on the data in the config file). 

The config file settings are not treated as a hardcoded source of truth like [environment variables](./environment-variables.md) are.

## Example `config.yml` file

This file sets up a user account and two database connections.

```
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
        password: {% raw %} "{{ env POSTGRES_TEST_DATA_PASSWORD }}" {% endraw %}
        dbname: test-data
    - name: Sample Dataset (Copy)
      engine: h2
      details:
        db: "/home/cam/metabase/resources/sample-database.db;USER=GUEST;PASSWORD={{env SAMPLE_DATASET_PASSWORD}}"
```

To determine which keys you can specify, simply look at the fields available in Metabase itself.

## Referring to environment variables in the `config.yml`

Environment variables can be specified with `{% raw %}{{ template-tags }}{% endraw %}` like `{% raw %}{{ env POSTGRES_TEST_DATA_PASSWORD }}{% endraw %}` or `{% raw %}[[options {{template-tags}}]]{% endraw %}`.

Metabase doesn't support recursive expansion, so if one of your environment variables references _another_ environment variable, you're going to have a bad time.

## Disable initial database sync

When loading a data model from a serialized dump, you want to disable the scheduler so that the Metabase doesn't try to sync.

To disable the initial database sync, you can add `config-from-file-sync-database` to the `settings` list and set the value to `false`. The setting `config-from-file-sync-database` must come _before_ the databases list, like so:

```
version: 1
config:
  settings:
    config-from-file-sync-databases: false
  databases:
    - name: my-database
      engine: h2
      details: ...
```

## List of settings

In general, the settings you can set in the `settings` section of this config file map to the [environment variables](./environment-variables.md).

The actual key that you include in the config file differs slightly from the format used for environment variables. For environment variables, the form is in screaming snake case, prefixed by an `MB`:

```
MB_NAME_OF_VARIABLE
```

Whereas in the config file, you'd translate that to:

```
name-of-variable
```

So for example, if you wanted to specify the `MB_EMAIL_FROM_NAME` not in an environment variable, but instead in the `config.yml` file:

```
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

## Users and Admins

The first user created in a Metabase instance is an Admin. The first user listed in the config file may be designated an admin, but not necessarily, for example if someone has already spun up and logged into that Metabase for the first time, that user would be the automatically designated admin. Additionally, you can specify a user account as an admin by using the `is_superuser: true` key.

In the following example:
```
version: 1
config:
  users:
    - first_name: a
      last_name: b
      password: metabot1
      email: a@b.com
    - first_name: b
      last_name: a
      password: metabot1
      email: b@a.com
    - first_name: c
      last_name: a
      password: metabot1
      is_superuser: true
      email: c@a.com
```
both users a@b.com and c@a.com will be admins: a@b.com because it's the first one on the list (if the instance is not yet configured) and c@a.com because it has the is_superuser flag. If an instance has already been configured, then a@b.com will be loaded as a normal user.

 
