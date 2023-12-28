---
title: Running Metabase
---

# Running Metabase

Metabase runs on the Java Virtual Machine (JVM), and depending on how it's configured, it may use the server's filesystem to store some information. Problems with either the JVM or the filesystem can therefore prevent Metabase from running.

## Java version

Make sure you're using a Java version of 11 or higher.

## WARNING: sun.reflect.Reflection.getCallerClass is not supported

Don't worry about it.

```
WARNING: sun.reflect.Reflection.getCallerClass is not supported. This will impact performance.
```

If you see the above error, ignore it. Your Metabase is perfectly healthy and performing as it should.

## Metabase fails to start due to Heap Space OutOfMemoryErrors

The JVM can normally figure out how much RAM is available on the system and automatically set a sensible upper bound for heap memory usage. On certain shared hosting environments, however, this doesn't always work as desired. The usual symptom of this is an error message like:

```
java.lang.OutOfMemoryError: Java heap space
```

If you are seeing this, you need to set a JVM option to tell Java know explicitly how much memory it should use for the heap. For example, your Java runtime might use the `-X` flag to do this:

```
java -Xmx2g -jar metabase.jar
```

Adjust the memory allocation upward until Metabase seems happy, but make sure to keep the number lower than the total amount of RAM available on your machine, because Metabase won't be the only process running. Leaving 1--2 GB of RAM for other processes is generally enough, so you might set `-Xmx` to `1g` on a machine with 2 GB of RAM, `2g` on one with 4 GB of RAM, and so on. You may need to experiment with this settings to find one that makes Metabase and everything else play nicely together.

You can also use the environment variable `JAVA_OPTS` to set JVM args instead of passing them directly to `java`. This is particularly useful when running the Docker image:

```
docker run -d -p 3000:3000 -e "JAVA_OPTS=-Xmx2g" metabase/metabase
```

## Diagnosing memory issues causing OutOfMemoryErrors

If the Metabase instance starts and runs for a significant amount of time before running out of memory, there might be a specific event, such as a large query, triggering the `OutOfMemoryError`. One way to diagnose where the memory is being used is to enable heap dumps when an `OutOfMemoryError` is triggered. To enable this, you need to add two flags to the `java` invocation:

```
java -Xmx2g -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/path/to/a/directory -jar metabase-jar
```

The `-XX:HeapDumpPath` flag specifies where to put the dump---the current directory is the default. When an `OutOfMemoryError` occurs, it will dump an `hprof` file to the directory specified. These can be very large (i.e., the size of the `-Xmx` argument) so ensure your disk has enough space. These `hprof` files can be read with many different tools, such as `jhat` (which is included with the JDK) or the [Eclipse Memory Analyzer Tool][eclipse-memory-analyzer].

## Metabase cannot read or write from a file or folder (IOError)

If you see an error regarding file permissions, like Metabase being unable to read a SQLite database or a custom GeoJSON map file, check out the section "Metabase can't read to/from a file or directory" in our [Docker troubleshooting guide](./docker.md).

[eclipse-memory-analyzer]: https://www.eclipse.org/mat/
