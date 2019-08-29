# Metabase OS X App

NOTE: These instructions are only for packaging a built Metabase uberjar into `Metabase.app`. They are not useful if your goal is to work on Metabase itself; for development, please see
our [developers' guide](developers-guide.md).

## Prereqs

1.  Install XCode.

1.  Install XCode command-line tools. In `Xcode` > `Preferences` > `Locations` select your current Xcode version in the `Command Line Tools` drop-down.

1.  Run `./bin/build` to build the latest version of the uberjar.

1.  Next, you'll need to run the following commands before building the app:

    ```bash
      # Fetch and initialize git submodule
      git submodule update --init

      # Install Perl modules used by ./bin/osx-setup and ./bin/osx-release
      sudo cpan install File::Copy::Recursive Readonly String::Util Text::Caml JSON

      # Copy JRE and uberjar
      ./bin/osx-setup
    ```

`./bin/osx-setup` will copy over things like the JRE into the Mac App directory for you. You only need to do this once the first time you plan on building the Mac App.
This also runs `./bin/build` to get the latest uberjar and copies it for you; if the script fails near the end, you can just copy the uberjar to `OSX/Resources/metabase.jar`.)

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
# (You can skip this step if you just ran ./bin/osx-setup, because it does this step for you)
./bin/build && cp target/uberjar/metabase.jar OSX/Resources/metabase.jar

# Bundle entire app, and upload to s3
./bin/osx-release
```

## Debugging ./bin/osx-release

*  You can run individual steps of the release script by passing in the appropriate step subroutines. e.g. `./bin/osx-release create_dmg upload`.
   The entire sequence of different steps can be found at the bottom of `./bin/osx-release`.
*  Generating the DMG seems to be somewhat finicky, so if it fails with a message like "Device busy" trying the step again a few times usually resolves the issue.
   You can continue the build process from the DMG creation step by running `./bin/osx-release create_dmg upload`.
