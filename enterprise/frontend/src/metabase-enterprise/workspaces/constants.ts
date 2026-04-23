export const POLLING_INTERVAL = 1000;

export const DOCKER_RUN_COMMAND = `docker run -d -p 3000:3000 \\
  -v $(pwd)/config.yml:/config.yml \\
  -v $(pwd)/metadata.json:/metadata.json \\
  -v $(pwd)/field_values.json:/field_values.json \\
  -e MB_CONFIG_FILE_PATH=/config.yml \\
  -e MB_TABLE_METADATA_FILE_PATH=/metadata.json \\
  -e MB_FIELD_VALUES_FILE_PATH=/field_values.json \\
  --name metabase \\
  metabase/metabase-enterprise:latest`;
