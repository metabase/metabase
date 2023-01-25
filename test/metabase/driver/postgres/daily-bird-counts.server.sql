DO $$ BEGIN
  PERFORM pg_terminate_backend(pg_stat_activity.pid)
  FROM pg_stat_activity
  WHERE pid <> pg_backend_pid()
    AND pg_stat_activity.datname = 'daily-bird-counts';
END $$;

DROP DATABASE IF EXISTS "daily-bird-counts";

CREATE DATABASE "daily-bird-counts";