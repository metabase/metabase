# When should I migrate H2 to mySQL or Postgres?

As soon as you’re planning on using Metabase for anything other than testing. H2 is fairly easily corruptible, so it’s better to be safe than sorry when running Metabase in production. The migration is fairly simple, and [full instructions](../../operations-guide/start.html#migrating-from-using-the-h2-database-to-mysql-or-postgres) are available.