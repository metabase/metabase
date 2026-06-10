---
title: Metabase JAR commands
description: Commands built into the Metabase JAR for managing your instance, including database migrations, serialization, and administrative tasks.
---

# Metabase JAR commands

> Looking for the `mb` command-line client that drives a Metabase instance over its API, on its own or through an AI agent? Check out the [Metabase CLI](./metabase-cli.md).

Metabase ships with some handy commands for administration, maintenance, and automation tasks. These commands run on the server, built into the Metabase JAR, and let you manage your Metabase instance, migrate databases, handle serialization, and generate documentation.

To view a list of commands, run the Metabase jar followed by `help`.

```
java --add-opens java.base/java.nio=ALL-UNNAMED -jar metabase.jar help
```

Metabase will print out the help text for available commands.
