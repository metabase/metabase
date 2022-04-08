/* extra dbs we have not created DDL/loading for yet */
CREATE DATABASE IF NOT EXISTS "toucan-microsecond-incidents";
connect to jdbc:ocient://10.10.110.4:4050/toucan-microsecond-incidents;
create user mb password = 'mbTesting';
GRANT ROLE "toucan-microsecond-incidents Analyst" to USER mb;

CREATE DATABASE IF NOT EXISTS "string-times";
connect to jdbc:ocient://10.10.110.4:4050/string-times;
create user mb password = 'mbTesting';
GRANT ROLE "string-times Analyst" to USER mb;

CREATE DATABASE IF NOT EXISTS "basic-field-comments";
connect to jdbc:ocient://10.10.110.4:4050/basic-field-comments;
create user mb password = 'mbTesting';
GRANT ROLE "basic-field-comments Analyst" to USER mb;

CREATE DATABASE IF NOT EXISTS "comment-after-sync";
connect to jdbc:ocient://10.10.110.4:4050/comment-after-sync;
create user mb password = 'mbTesting';
GRANT ROLE "comment-after-sync Analyst" to USER mb;

CREATE DATABASE IF NOT EXISTS "db-with-some-cruft";
connect to jdbc:ocient://10.10.110.4:4050/db-with-some-cruft;
create user mb password = 'mbTesting';
GRANT ROLE "db-with-some-cruft Analyst" to USER mb;

CREATE DATABASE IF NOT EXISTS "table_with_updated_desc_db";
connect to jdbc:ocient://10.10.110.4:4050/table_with_updated_desc_db;
create user mb password = 'mbTesting';
GRANT ROLE "table_with_updated_desc_db Analyst" to USER mb;

CREATE DATABASE IF NOT EXISTS "table_with_comment_db";
connect to jdbc:ocient://10.10.110.4:4050/table_with_comment_db;
create user mb password = 'mbTesting';
GRANT ROLE "table_with_comment_db Analyst" to USER mb;

CREATE DATABASE IF NOT EXISTS "table_with_comment_after_sync_db";
connect to jdbc:ocient://10.10.110.4:4050/table_with_comment_after_sync_db;
create user mb password = 'mbTesting';
GRANT ROLE "table_with_comment_after_sync_db Analyst" to USER mb;

/* interval based checkins require relative time so we can't preload them */

CREATE DATABASE IF NOT EXISTS "checkins_interval_15";
connect to jdbc:ocient://10.10.110.4:4050/checkins_interval_15;
create user mb password = 'mbTesting';
GRANT ROLE "checkins_interval_15 Analyst" to USER mb;

CREATE DATABASE IF NOT EXISTS "checkins_interval_86400";
connect to jdbc:ocient://10.10.110.4:4050/checkins_interval_86400;
create user mb password = 'mbTesting';
GRANT ROLE "checkins_interval_86400 Analyst" to USER mb;

CREATE DATABASE IF NOT EXISTS "checkins_interval_900";
connect to jdbc:ocient://10.10.110.4:4050/checkins_interval_900;
create user mb password = 'mbTesting';
GRANT ROLE "checkins_interval_900 Analyst" to USER mb;

