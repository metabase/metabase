DO $$ BEGIN
  PERFORM pg_terminate_backend(pg_stat_activity.pid)
  FROM pg_stat_activity
  WHERE pid <> pg_backend_pid()
    AND pg_stat_activity.datname = 'test-data';
END $$;

DROP DATABASE IF EXISTS "test-data";

CREATE DATABASE "test-data";