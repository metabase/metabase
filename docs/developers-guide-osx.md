# Metabase OS X App

NOTE: These instructions are only for packaging a built Metabase uberjar into `Metabase.app`. They are not useful if your goal is to work on Metabase itself; for development, please see
our [developers' guide](developers-guide.md).

## Prereqs

1.  Install XCode.

1.  Install XCode command-line tools. In `Xcode` > `Preferences` > `Locations` select your current Xcode version in the `Command Line Tools` drop-down.

1.  Run `./bin/build` to build the latest version of the uberjar.

1.  Next, you'll need to run the following commands before building the app for the first time. You only need to do these once:

    1.  Install Git submodule

        ```bash
          git submodule update --init
        ```

    1.  Install CPAN modules

        ```bash
        sudo cpan
        install force File::Copy::Recursive Readonly String::Util Text::Caml JSON
        quit
        ```

        You can install [PerlBrew](https://perlbrew.pl/) if you want to install CPAN modules without having to use `sudo`.

        Normally you shouldn't have to use `install force` to install the modules above, but `File::Copy::Recursive` seems fussy lately and has a failing test that
        prevents it from installing normally.

    1.  Add a JRE to the `OSX/Metabase/jre`

        You can download a copy of a JRE from https://adoptopenjdk.net/releases.html — make sure you download a JRE rather than JDK. Move the `Contents/Home` directory from
        the JRE archive into `OSX/Metabase/jre`. For example:

        ```bash
        wget https://github.com/AdoptOpenJDK/openjdk8-binaries/releases/download/jdk8u232-b09/OpenJDK8U-jre_x64_mac_hotspot_8u232b09.tar.gz
        tar -xzvf OpenJDK8U-jre_x64_mac_hotspot_8u232b09.tar.gz
        mv jdk8u232-b09-jre/Contents/Home/ OSX/Metabase/jre
        ```

        You are fine to use whatever the latest JRE version available is. I have been using the HotSpot JRE instead of the OpenJ9 one but it ultimately shouldn't make a difference.

## Releasing

A handy Perl script called `./bin/osx-release` takes care of all of the details for you. Before you run it for the first time, you'll need to set up a few additional things:

```bash
# Install aws command-line client (if needed)
brew install awscli

# Configure AWS Credentials
# You'll need credentials that give you permission to write the metabase-osx-releases S3 bucket.
# You just need the access key ID and secret key; use the defaults for locale and other options.
aws configure --profile metabase

# Obtain a copy of the private key used for signing the app (ask Cam)
# and put a copy of it at ./dsa_priv.pem
cp /path/to/private/key.pem OSX/dsa_priv.pem
```

You'll need the `Apple Developer ID Application Certificate` in your computer's keychain.
You'll need to generate a Certificate Signing Request from Keychain Access, and have Sameer go to [the Apple Developer Site](https://developer.apple.com/account/mac/certificate/)
and generate one for you, then load the file on your computer.

Finally, you may need to open the project a single time in Xcode to make sure the appropriate "build schemes" are generated (these are not checked into CI).
Run `open OSX/Metabase.xcodeproj` to open the project, which will automatically generate the appropriate schemes. This only needs to be done once.

After that, you are good to go:
```bash
# Build the latest version of the uberjar and copy it to the Mac App build directory
./bin/build && cp target/uberjar/metabase.jar OSX/Resources/metabase.jar

# Bundle entire app, and upload to s3
./bin/osx-release
```

## Debugging ./bin/osx-release

*  You can run individual steps of the release script by passing in the appropriate step subroutines. e.g. `./bin/osx-release create_dmg upload`.
   The entire sequence of different steps can be found at the bottom of `./bin/osx-release`.
*  Generating the DMG seems to be somewhat finicky, so if it fails with a message like "Device busy" trying the step again a few times usually resolves the issue.
   You can continue the build process from the DMG creation step by running `./bin/osx-release create_dmg upload`.
