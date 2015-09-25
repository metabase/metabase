
##Step 1: Installing Metabase

### Getting Metabase 

Metabase is a program that runs on the Java virtual machine (or JVM). There are two main means of running it, depending on which platform you use. 


### Using the Mac OS X Native Application

If you're using OS X, we offer a native application which you can download in the Mac App Store or [here](www.metabase.com/download/osx/latest) which comes bundled with everything you need to get started. If you're just trying out Metabase, we recommend you use this. Once you've downloaded the program, move it to your applications folder and click on it to run. Once you see the loading screen, you can move on to the next section to [connect it to your database](02-connecting-metabase.md)

### Running the JAR Directly 

If you're fairly technical or planning on immediately setting up Metabase on a shared server, you can download the latest JAR distribution [here](www.metabase.com/download/jar/latest). To run this JAR, you'll need to get Java installed on your machine.


**On Linux:**

Your distribution might ship with Java pre-installed. Try `java -version` to see if java is set up. If not, you can install Java in a number of ways depending on your distribution.

On Ubuntu, or any other distribution with the Debian package manager, 
	
	apt-get install -Y openjdk-7-jre-headless

will get Java installed. On other distributions look at your distribution documentation.

**On Windows or Mac:**

Go to the [Java JDK downloads page](http://www.oracle.com/technetwork/java/javase/downloads/index.html) and download the latest JDK for your platform.


Once you've gotten java installed on your machine, go to the command line and try typing `java` to make sure it's installed correctly. 

The Metabase server creates temporary files when it runs, and so you'll probably want to place the metabase.jar file in its own directory. To get things started, 
run the command 
    java -jar metabase.jar

After a few seconds to start up, you should have the Metabase server running on port 3000 of your computer. Go to http://localhost:3000](http://localhost:3000) in a browser and you should see the screen below. 

![welcomescreen](images/WelcomeScreen.png)

Now that you've gotten metabase installed, let's [connect it to your database](02-connecting-metabase.md)