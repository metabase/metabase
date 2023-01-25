DO $$ BEGIN
  PERFORM pg_terminate_backend(pg_stat_activity.pid)
  FROM pg_stat_activity
  WHERE pid <> pg_backend_pid()
    AND pg_stat_activity.datname = 'office-checkins';
END $$;

DROP DATABASE IF EXISTS "office-checkins";

CREATE DATABASE "office-checkins";