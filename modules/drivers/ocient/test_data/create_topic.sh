export JAVA_HOME=/usr/lib/jvm/java-16-openjdk-16.0.1.0.9-3.rolling.el7.x86_64/
export PATH=/usr/lib/jvm/java-16-openjdk-16.0.1.0.9-3.rolling.el7.x86_64/bin:$PATH

for top in categories checkins users venues 
do
    /opt/kafka300/bin/kafka-topics.sh --create --topic ${top}  --bootstrap-server sales-spark0:9092 --partitions 1 --replication-factor 1
done
