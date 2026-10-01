--
-- The postgres entrypoint creates POSTGRES_DB (`sample`) and loads the QA image's
-- sample data into it. Metabase needs a separate database for its own app db, so
-- create it here — this file runs before the image's `sample_data.sql.gz`.
--
-- This script runs whenever the `postgres_data` volume doesn't exist on `docker compose up`.
--

CREATE DATABASE metabase OWNER metabase;
