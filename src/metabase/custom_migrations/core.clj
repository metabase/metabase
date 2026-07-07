(ns metabase.custom-migrations.core
  "Home for Liquibase custom migrations. Legacy custom migrations still live in
  `metabase.app-db.custom-migrations`.

  The migration classes are referenced by changesets under `resources/migrations/` and loaded at
  startup via [[metabase.custom-migrations.init]] (and by AOT class lookup for the `migrate` CLI).")
