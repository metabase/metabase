DO $$ BEGIN
  PERFORM pg_terminate_backend(pg_stat_activity.pid)
  FROM pg_stat_activity
  WHERE pid <> pg_backend_pid()
    AND pg_stat_activity.datname = 'sad-toucan-incidents';
END $$;

DROP DATABASE IF EXISTS "sad-toucan-incidents";

CREATE DATABASE "sad-toucan-incidents";