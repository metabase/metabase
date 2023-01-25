DO $$ BEGIN
  PERFORM pg_terminate_backend(pg_stat_activity.pid)
  FROM pg_stat_activity
  WHERE pid <> pg_backend_pid()
    AND pg_stat_activity.datname = 'test-data-self-referencing-user';
END $$;

DROP DATABASE IF EXISTS "test-data-self-referencing-user";

CREATE DATABASE "test-data-self-referencing-user";