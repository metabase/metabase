---
title: Java Versions
---

# Java Versions

Metabase requires a Java Runtime Environment (JRE), with a Java version of 11 or higher.

We recommend the latest LTS version of JRE from [Eclipse Temurin](https://adoptium.net/) with HotSpot JVM and x64 architecture, but any version Java 11 or higher should work (see [supported versions](https://adoptium.net/support.html)), including other types of JVM and architecture, and other distributions such as [OpenJDK](https://openjdk.java.net/), [Amazon Corretto](https://aws.amazon.com/corretto/), [Zulu OpenJDK](https://www.azul.com/downloads/zulu-community), [Oracle Java](https://www.java.com/), and [IBM Semeru](https://developer.ibm.com/languages/java/semeru-runtimes/) (If you want an OpenJ9 alternative of Eclipse Temurin).

**Note** When using a "headless" version, the JVM needs to have AWT classes, which are sometimes not included. Otherwise Pulses and other functionality might not work correctly or not at all.

When developing and building Metabase, a Java Development Kit (JDK) is required. We recommend the latest LTS version of JDK from Eclipse Temurin with HotSpot JVM.

#### Check installed version

To see if your system already has Java installed, try running this command from a terminal:

```
java -version
```

You should see output similar to this:

    openjdk version "11.0.13" 2021-10-19
    OpenJDK Runtime Environment Temurin-11.0.13+8 (build 11.0.13+8)
    OpenJDK 64-Bit Server VM Temurin-11.0.13+8 (build 11.0.13+8, mixed mode)

If you get an error, you need to install Java. If the Java release date is more than a few months old, you should update Java.