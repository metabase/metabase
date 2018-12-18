#!/usr/bin/env sh
mvn package -f ./local-query-execution-factory/pom.xml
cp ./local-query-execution-factory/target/local-query-execution-factory-0.2.jar ./bin/lib/local-query-execution-factory-0.2.jar
mvn install:install-file -Dfile=./bin/lib/local-query-execution-factory-0.2.jar -DgroupId=com.stratio.metabase -DartifactId=local-query-execution-factory -Dversion=0.2 -Dpackaging=jar

mvn dependency:copy -Dartifact=com.stratio.jdbc:stratio-crossdata-jdbc4:2.13.4-cb4ebcf -DoutputDirectory=./bin/lib/
mvn install:install-file -Dfile=./bin/lib/stratio-crossdata-jdbc4-2.13.4-cb4ebcf.jar -DgroupId=com.stratio.jdbc -DartifactId=stratio-crossdata-jdbc4 -Dversion=2.13.4-cb4ebcf -Dpackaging=jar
