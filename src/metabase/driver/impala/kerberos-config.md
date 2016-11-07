metabase options: 
;AuthMech=1;LogLevel=6;LogPath=/tmp;KrbRealm=SIDNLABS;KrbHostFQDN=hadoop-data-01.sidnlabs.nl;KrbServiceName=impala


create keytab:

ktutil:  addent -password -p maarten@SIDNLABS -k 1 -e aes256-cts
wkt my_keytab

use jaas option:
java -Djava.security.auth.login.config=/Users/maarten/sidn/development/github/metabase/src/metabase/driver/impala/jaas.conf \
-Dsun.security.krb5.debug=true -Dsun.security.jgss.debug=true -jar metabase.jar

java -Djava.security.auth.login.config=jaas.conf -Dsun.security.krb5.debug=true -Dsun.security.jgss.debug=true -jar metabase.jar


Make sure to enable Java strong encryption.