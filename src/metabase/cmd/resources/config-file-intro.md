---
title: "Metabase config file template"
---

# Metabase config file template

You can generate this doc page by changing into the top-level Metabase directory and running:

```
clojure -M:doc:ee config-template
```

The template lists example `database`, `user`, and `settings` sections for the [config file](./config-file.md).


```yaml
# A config file template for Metabase.
# You'll need to update (or remove) the `users` and `databases` sections.
# The settings in `settings` include default values. We recommend removing
# or commenting out settings that you don't set.
# To use an env var, you can use a template string: "{{ env YOUR_ENV_VAR }}"
# Note the quote marks wrapping the env var template.
# For more on the configuration file, see:
# https://www.metabase.com/docs/latest/configuring-metabase/config-file
# For more on what each setting does, check out:
# https://www.metabase.com/docs/latest/configuring-metabase/environment-variables
