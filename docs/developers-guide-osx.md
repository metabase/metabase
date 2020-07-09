# Metabase OS X App

NOTE: These instructions are only for packaging a built Metabase uberjar into `Metabase.app`. They are not useful if your goal is to work on Metabase itself; for development, please see
our [developers' guide](developers-guide.md).

## First-Time Configuration

### Building

The following steps need to be done before building the Mac App:

1.  Install XCode.

1.  Add a JRE to the `OSX/Metabase/jre`

    You can download a copy of a JRE from https://adoptopenjdk.net/releases.html?jvmVariant=hotspot — make sure you download a JRE rather than JDK. Move the `Contents/Home` directory from the JRE archive into `OSX/Metabase/jre`. For example:

    ```bash
    # Don't copy these commands -- this version is broken. See below
    wget https://github.com/AdoptOpenJDK/openjdk8-binaries/releases/download/jdk8u232-b09/OpenJDK8U-jre_x64_mac_hotspot_8u232b09.tar.gz
    tar -xzvf OpenJDK8U-jre_x64_mac_hotspot_8u232b09.tar.gz
    mv jdk8u232-b09-jre/Contents/Home/ OSX/Metabase/jre
    ```

    **VERY IMPORTANT!**

    Make sure the JRE version you use is one that is known to work successfully with notarization/the hardened
    runtime. See https://github.com/AdoptOpenJDK/openjdk-build/issues/1130 for more information. I have personally had
    success with [this nighly build of
    11.0.6](https://github.com/AdoptOpenJDK/openjdk11-binaries/releases/download/jdk11u-2020-02-05-17-25/OpenJDK11U-jre_x64_mac_hotspot_2020-02-05-17-25.tar.gz). If you get notarization errors like

    > The executable does not have the hardened runtime enabled.

    (Referring to files in `Metabase.app/Contents/Resources/jre/bin/`) then use a different build of the JRE.

    Assuming the OpenJDK folks have resolved this issue going forward, you are fine to use whatever the latest JRE version available is. I have been using the HotSpot JRE instead of the
    OpenJ9 one but it ultimately shouldn't make a difference.

1)  Copy Metabase uberjar to OSX resources dir

    ```bash
    cp /path/to/metabase.jar OSX/Resources/metabase.jar
    ```

    Every time you want to build a new version of the Mac App, you can simply update the bundled uberjar the same way. I usually download the new JAR from `downloads.metabase.com` after it's up and copy that one into place.

At this point, you should try opening up the Xcode project and building the Mac App in Xcode by clicking the run button. The app should build and launch at this point. If it doesn't, ask Cam for help!

### Releasing

The following steps are prereqs for releasing the Mac App:

1.  Install XCode command-line tools. In `Xcode` > `Preferences` > `Locations` select your current Xcode version in the `Command Line Tools` drop-down.

1)  Install AWS command-line client (if needed)

    ```bash
    brew install awscli
    ```

1)  Configure AWS Credentials for `metabase` profile (used to upload artifacts to S3)

    You'll need credentials that give you permission to write the metabase-osx-releases S3 bucket.
    You just need the access key ID and secret key; use the defaults for locale and other options.

    ```bash
    aws configure --profile metabase
    ```

1)  Obtain a copy of the private key for signing app updates (ask Cam) and put a copy of it at `OSX/dsa_priv.pem`

    ```bash
    cp /path/to/private/key.pem OSX/dsa_priv.pem
    ```

1)  Add `Apple Developer ID Application Certificate` to your computer's keychain.

    You'll need to generate a Certificate Signing Request from Keychain Access, and have Sameer go to [the Apple Developer Site](https://developer.apple.com/account/mac/certificate/) and generate one for you, then load the file on your computer.

1)  Export your Apple ID for building the app as `METABASE_MAC_APP_BUILD_APPLE_ID`. (This Apple ID must be part of the Metabase org in the Apple developer site. Ask Cam or Sameer to add you if it isn't.)

    ```bash
    #  Add this to .zshrc or .bashrc
    export METABASE_MAC_APP_BUILD_APPLE_ID=my_email@whatever.com
    ```

1)  Create an App-Specific password for the Apple ID in the previous step

    Go to https://appleid.apple.com/account/manage then `Security` > `App-Specific Passwords` > `Generate Password`

    1.  Store the password in Keychain

        ```bash
        xcrun altool \
        --store-password-in-keychain-item "METABASE_MAC_APP_BUILD_PASSWORD" \
        -u "$METABASE_MAC_APP_BUILD_APPLE_ID" \
        -p <secret_password>
        ```

1)  Install Clojure CLI

    ```bash
    brew install clojure
    ```

## Building & Releasing the Mac App

After following the configuration steps above, to build and release the app you can use the `./bin/osx-release` script:

1. Make sure release is *published* on GitHub and release notes are ready. The script copies these for the update release notes.

1. Copy latest uberjar to the Mac App build directory

   ```bash
   cp path/to/metabase.jar OSX/Resources/metabase.jar
   ```

1. Bundle entire app, and upload to s3

   ```bash
   cd OSX
   clojure -m macos-release
   ```
