DO $$ BEGIN
  PERFORM pg_terminate_backend(pg_stat_activity.pid)
  FROM pg_stat_activity
  WHERE pid <> pg_backend_pid()
    AND pg_stat_activity.datname = 'just-dates';
END $$;

DROP DATABASE IF EXISTS "just-dates";

CREATE DATABASE "just-dates";