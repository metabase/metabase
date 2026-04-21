---
title: Metabase CLI
description: CLI commands for managing your Metabase instance, including database migrations, serialization, and administrative tasks.
---

# Metabase CLI

Metabase ships with some handy CLI commands for administration, maintenance, and automation tasks. These commands let you manage your Metabase instance, migrate databases, handle serialization, and generate documentation.

To view a list of commands, run the Metabase jar followed by `help`.

```
java --add-opens java.base/java.nio=ALL-UNNAMED -jar metabase.jar help
```

Metabase will print out the help text for available commands.
