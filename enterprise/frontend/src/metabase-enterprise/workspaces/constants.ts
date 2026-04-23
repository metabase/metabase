export const POLLING_INTERVAL = 1000;

export const DOCKER_RUN_COMMAND = `docker run -d -p 3000:3000 \\
  -v $(pwd)/config.yml:/config.yml \\
  -e MB_CONFIG_FILE_PATH=/config.yml \\
  --name metabase \\
  metabase/metabase-enterprise:latest`;
