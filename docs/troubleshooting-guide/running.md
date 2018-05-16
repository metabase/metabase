
## Specific Problems:

### Metabase fails to start due to Heap Space OutOfMemoryErrors

Normally, the JVM can figure out how much RAM is available on the system and automatically set a sensible upper bound for heap memory usage. On certain shared hosting
environments, however, this doesn't always work perfectly. If Metabase fails to start with an error message like

    java.lang.OutOfMemoryError: Java heap space

You'll just need to set a JVM option to let it know explicitly how much memory it should use for the heap space:

    java -Xmx2g -jar metabase.jar

Adjust this number as appropriate for your shared hosting instance. Make sure to set the number lower than the total amount of RAM available on your instance, because Metabase isn't the only process that'll be running. Generally, leaving 1-2 GB of RAM for these other processes should be enough; for example, you might set `-Xmx` to `1g` for an instance with 2 GB of RAM, `2g` for one with 4 GB of RAM, `6g` for an instance with 8 GB of RAM, and so forth. You may need to experiment with these settings a bit to find the right number.

As above, you can use the environment variable `JAVA_TOOL_OPTIONS` to set JVM args instead of passing them directly to `java`. This is useful when running the Docker image,
for example.

    docker run -d -p 3000:3000 -e "JAVA_TOOL_OPTIONS=-Xmx2g" metabase/metabase

### Diagnosing memory issues causing OutOfMemoryErrors

If the Metabase instance starts and runs for a significant amount of time before running out of memory, there might be an event (i.e. a large query) triggering the `OutOfMemoryError`. One way to help diagnose where the memory is being used is to enable heap dumps when an OutOfMemoryError is triggered. To enable this, you need to add two flags to the `java` invocation:

    java -Xmx2g -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/path/to/a/directory -jar metabase-jar

The `-XX:HeapDumpPath` flag is optional, with the current directory being the default. When an `OutOfMemoryError` occurs, it will dump an `hprof` file to the directory specified. These can be large (i.e. the size of the `-Xmx` argument) so ensure your disk has enough space. These `hprof` files can be read with many different tools, such as `jhat` included with the JDK or the [Eclipse Memory Analyzer Tool](https://www.eclipse.org/mat/).
