DO $$ BEGIN
  PERFORM pg_terminate_backend(pg_stat_activity.pid)
  FROM pg_stat_activity
  WHERE pid <> pg_backend_pid()
    AND pg_stat_activity.datname = 'test-data-with-null-date-checkins';
END $$;

DROP DATABASE IF EXISTS "test-data-with-null-date-checkins";

CREATE DATABASE "test-data-with-null-date-checkins";