
##Step 1: Installing Metabase
Metabase uses Java to operate, so you'll need at least version 1.6 or later.  Not sure what version of Java you're using?  No problem.  Here's how to check: 

**Mac Users:**

In Terminal, insert the command prompt: "java -version".  You will receive a message similar to:

    java version "1.60_65"
    Java (TM) SE Runtime Environment (build 1.6.0_65-b14-466.1-11M4716)
    Java HotSpot (TM) 64-Bit Server VM (build 20.65-b04-466.1, mixed mode)
    
As long as the version is at least 1.6, you're all set to go! 

**Windows Users:**

Under Programs, click on the "Java" icon.  Click on "About" and then find the version number listed.  If you're using version 1.6 or greater, then you're good to go! 

---

If you don't have the latest version of Java, download it at: [https://java.com/en/download/](https://java.com/en/download/)

Once you take care of checking the version of java on your computer, **Download the Metabase file from [www.metabase.com/download](www.metabase.com/download).**  

Place the Metabase JAR in the directory.  

Run the command `java -jar metabase.jar` to create a file called "metabase.db.h2.db".  **This file contains important application data, so don't delete it!**

Now that you have Metabase installed, you can sync it to your database.  Go to [http://localhost:3000](http://localhost:3000) to connect your database.  

![welcomescreen](images/WelcomeScreen.png)

Now that you've gotten metabase installed, let's [connect it to your database](02-connecting-metabase.md)