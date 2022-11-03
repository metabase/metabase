JAR_VERSION = 2.0.33
VERSION_WITH_AWS_SDK = $(JAR_VERSION).1000
JAR_URL = https://s3.amazonaws.com/athena-downloads/drivers/JDBC/SimbaAthenaJDBC-$(VERSION_WITH_AWS_SDK)/SimbaAthenaJDBC42-$(VERSION_WITH_AWS_SDK)/AthenaJDBC42-$(JAR_VERSION).jar

# Source: https://www.pgrs.net/2011/10/30/using-local-jars-with-leiningen/
maven_repository/athena/athena-jdbc/$(JAR_VERSION)/athena-jdbc-${JAR_VERSION}.jar.sha1:
	mkdir -p maven_repository/athena/athena-jdbc/$(JAR_VERSION)/
	cd maven_repository/athena/athena-jdbc/$(JAR_VERSION)/ \
		&& curl $(JAR_URL) --output athena-jdbc-${JAR_VERSION}.jar --silent --show-error --continue-at - \
		&& sha1sum athena-jdbc-${JAR_VERSION}.jar | cut -f "1" -d " " > athena-jdbc-${JAR_VERSION}.jar.sha1

download-jar: maven_repository/athena/athena-jdbc/$(JAR_VERSION)/athena-jdbc-${JAR_VERSION}.jar.sha1
