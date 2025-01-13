---
title: Troubleshooting memory and JVM issues
---

# Troubleshooting memory and JVM issues

Metabase runs on the Java Virtual Machine (JVM), and depending on how it's configured, it may use the server's filesystem to store some information. Problems with either the JVM or the filesystem can therefore prevent Metabase from running.

## Java version

Make sure you're using a Java version of 11 or higher.

## Metabase's memory usage

Metabase ships as a JAR file that runs on the Java Virtual Machine (JVM).

It's important to distinguish _Metabase's_ memory usage from the _JVM's_ memory usage.

The JVM will consume a constant amount of memory. By default, the JVM will use about one fourth of a machine's RAM (though you can [change how much RAM you want the JVM to use](#allocating-more-memory-to-the-jvm)).

JVM applications (like Metabase) will consume and release the RAM allocated to the JVM. The JVM, however, won't release unused RAM to the machine; the JVM's memory use will be constant.

So on a machine with 8 GB of RAM, by default the JVM will use 2 GB of RAM. Metabase will use some or all of these 2 GBs of JVM-allocated RAM, depending on Metabase's activity. But from the machine's perspective, the JVM will always be using that allocated 2GB of RAM, even when Metabase is only using a fraction of that allocated RAM.

## Diagnosing memory issues

Given the above explanation of how the JVM handles memory, if you're having performance issues with Metabase that you don't think are due to your data warehouse, you'll want to check for these red flags:

## Metabase crashes due to Java heap space `OutOfMemoryError`

The JVM can normally figure out how much RAM is available on the system and automatically set a sensible upper bound for heap memory usage. On certain shared hosting environments, however, this doesn't always work as desired. The usual symptom of this is an error message like:

```
java.lang.OutOfMemoryError: Java heap space
```

If you're seeing this "Out of memory" (OOM) error, you'll need to [allocate more memory to the JVM](#allocating-more-memory-to-the-jvm).

### When viewing memory usage over time as a line chart, you see a sawtooth pattern

You can use tools to view how Metabase uses the memory available to it over time. Check out:

- [Observability with Prometheus](../installation-and-operation/observability-with-prometheus.md)
- [Monitoring your Metabase](../installation-and-operation/monitoring-metabase.md)

The specific Prometheus metric you need to check is jvm_memory_bytes_used{area="heap"}

A red flag to look out for: the sawtooth pattern. Metabase will quickly consume a lot of memory, which will trigger garbage collection, which frees up memory, which Metabase quickly consumes again. This up-down-up-down pattern of memory usage is the signature of frequent garbage collection cycles. The garbage collection will tie up CPU cycles, which can slow down your application.

If you're seeing this, you'll need to [increase the amount of memory allocated to the JVM](#allocating-more-memory-to-the-jvm).

## Allocating more memory to the JVM

You can set a JVM option to allocate more memory to the JVM's heap. For example, your Java runtime might use the `-X` flag to do this:

```sh
java -Xmx2g -jar metabase.jar
```

Adjust the memory allocation upward until Metabase seems happy, but make sure to keep the number lower than the total amount of RAM available on your machine, because Metabase won't be the only process running. Leaving 1 to 2 GB of RAM for other processes on the machine is generally enough, so you might set `-Xmx` to `1g` on a machine with 2 GB of RAM, `2g` on one with 4 GB of RAM, and so on. You may need to experiment with this settings to find one that makes Metabase and everything else play nicely together (and this experimentation may require upgrading to a machine with more memory).

You can also use the environment variable `JAVA_OPTS` to set JVM args instead of passing them directly to `java`. This is particularly useful when running the Docker image:

```sh
docker run -d -p 3000:3000 -e "JAVA_OPTS=-Xmx2g" metabase/metabase
```

## Diagnosing memory issues causing OutOfMemoryErrors

If the Metabase instance starts and runs for a significant amount of time before running out of memory, there might be a specific event, such as a large query, triggering the `OutOfMemoryError`. One way to diagnose where the memory is being used is to enable heap dumps when an `OutOfMemoryError` is triggered. To enable this, you need to add two flags to the `java` invocation:

```
java -Xmx2g -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/path/to/a/directory -jar metabase-jar
```

The `-XX:HeapDumpPath` flag specifies where to put the dump---the current directory is the default. When an `OutOfMemoryError` occurs, the JVM will dump an `hprof` file to the directory specified. These `hprof` files can be large (the size of the `-Xmx` argument) so make sure your disk has enough space. These `hprof` files can be read with many different tools, such as `jhat` (which is included with the JDK) or the [Eclipse Memory Analyzer Tool][eclipse-memory-analyzer].

## Metabase cannot read or write from a file or folder (IOError)

If you see an error regarding file permissions, like Metabase being unable to read a SQLite database or a custom GeoJSON map file, check out the section "Metabase can't read to/from a file or directory" in our [Docker troubleshooting guide](./docker.md).

## WARNING: sun.reflect.Reflection.getCallerClass is not supported

Don't worry about it.

```
WARNING: sun.reflect.Reflection.getCallerClass is not supported. This will impact performance.
```

If you see the above error, ignore it. Your Metabase is perfectly healthy and performing as it should.

[eclipse-memory-analyzer]: https://www.eclipse.org/mat/
