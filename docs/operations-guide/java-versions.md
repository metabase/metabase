# Java Versions

To run Metabase a Java Runtime Environment (JRE) is required.

It is recommended to use the latest LTS version of JRE from [AdoptOpenJDK](https://adoptopenjdk.net/releases.html) with HotSpot JVM and x64 architecture, but any [supported version](https://adoptopenjdk.net/support.html) should work, including other types of JVM and architecture, and other distributions such as [OpenJDK](https://openjdk.java.net/), [Amazon Corretto](https://aws.amazon.com/corretto/) and [Oracle Java](https://www.java.com/).

**Note** When using a "headless" version, the JVM needs to have AWT classes, which are sometimes not included. Otherwise Pulses and other functionality might work.

When developing and building Metabase a Java Development Kit (JDK) is required. It is recommended to use the latest LTS version of JDK from AdoptOpenJDK with HotSpot JVM.

#### Check installed version

As a quick check to see if your system already has Java installed and it's version details, try running this command from a terminal:

```
java -version
```

You should see output similar to this:

    openjdk version "11.0.7" 2020-04-14
    OpenJDK Runtime Environment AdoptOpenJDK (build 11.0.7+10)
    OpenJDK 64-Bit Server VM AdoptOpenJDK (build 11.0.7+10, mixed mode)

If you did not see such output, but instead saw either an error or the Java release date is more than a few months old, then you need to install or update Java.
