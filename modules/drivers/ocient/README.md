# metabase_ocient_driver
Ocient Database Driver for Metabase

### Prereqs: Install Metabase from source locally

```bash
cd /path/to/metabase/source
bin/build
```

### Build the Ocient Metbase driver

```bash
bin/build-driver.sh ocient
```

### Copy the new jar file and the Ocient JDBC jar file to the Metbase plugins dir and restart Metabase
```bash
cp resources/modules/ocient.metabase-driver.jar /path/to/metabase/plugins/
cp ocient-jdbc4-V.RR-jar-with-dependencies.jar /path/to/metabase/plugins/
jar -jar /path/to/metabase/metabase.jar
```
