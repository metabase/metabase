## This force to make Metabase can build and run on ARM (arm64v8) architect

* This project is built and test on Oracle Ampere A1  with Canonical Ubuntu 20.04
* The docker file for `arm64v8`
  * Dockerfile_arm64v8
  * To build the this file on armv8 machine
  ```sh
  cd  metabase
  docker build -f ./Dockerfile_arm64v8 -t duonghuynhbaocr/metabase:arm64v8_0.0.1 .

   ```
* You can create your self docker-compose file to build and run this images
  
```sh
version: "3.8"

services:
  metabase_arm64v8:
    build:
      context: .
      dockerfile: Dockerfile_arm64v8
    ports:
      - 3000:3000
    volumes:
      - ./metabase-data:/metabase-data
    restart: always

    environment: #default username is : postgres
      MB_DB_FILE: /metabase-data/metabase.db
      MB_DB_TYPE: postgres # use postgres to store metabase config
      MB_DB_DBNAME: MetabaseLocal # DTB name to store metabase config
      MB_DB_PORT: 5432
      MB_DB_USER: postgres
      MB_DB_PASS: <pass>
      MB_DB_HOST: <host>
      #JAVA_OPTS: -Xmx512m # 512MB for JAVA

```

  * or Run directly from docker-hub
```sh
version: "3.8"
services:
  metabase_arm64v8:
    image: duonghuynhbaocr/metabase:arm64v8_0.0.3
    ports:
      - 3000:3000
    volumes:
      - ./metabase-data:/metabase-data
    restart: always

    environment: 
      MB_DB_TYPE: postgres # use postgres to store metabase config
      MB_DB_DBNAME: MetabaseLocal # DTB name to store metabase config
      MB_DB_PORT: 5432
      MB_DB_USER: postgres #default username is : postgres
      MB_DB_PASS: <pass>
      MB_DB_HOST: <host>
      #JAVA_OPTS: -Xmx512m # 512MB for JAVA

```
