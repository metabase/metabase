export MB_DB_TYPE=postgres
export MB_DB_DBNAME=metabaseappdb
export MB_DB_PORT=5432
export MB_DB_USER=postgres
export MB_DB_PASS=my_secret_password
export MB_DB_HOST=localhost
java --add-opens java.base/java.nio=ALL-UNNAMED -jar target/uberjar/metabase.jar