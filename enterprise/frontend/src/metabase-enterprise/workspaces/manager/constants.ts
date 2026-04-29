export const POLLING_INTERVAL = 1000;

export const PREMIUM_EMBEDDING_TOKEN_ENV = "MB_PREMIUM_EMBEDDING_TOKEN";

export const DOCKER_RUN_COMMAND = `docker run -d -p 3000:3000 \\
  -v $(pwd)/config.yml:/config.yml \\
  -v $(pwd)/metadata.json:/metadata.json \\
  -v $(pwd)/field_values.json:/field_values.json \\
  -e MB_CONFIG_FILE_PATH=/config.yml \\
  -e MB_TABLE_METADATA_PATH=/metadata.json \\
  -e MB_FIELD_VALUES_PATH=/field_values.json \\
  -e ${PREMIUM_EMBEDDING_TOKEN_ENV} \\
  --name metabase \\
  metabase/metabase-enterprise:latest`;

export const DEFAULT_USER_EMAIL = "workspace@workspace.local";
export const DEFAULT_USER_PASSWORD = "password1";
