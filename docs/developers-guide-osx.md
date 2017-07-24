# Metabase OS X App

NOTE: These instructions are only for packaging a built Metabase uberjar into `Metabase.app`. They are not useful if your goal is to work on Metabase itself; for development, please see our [developers' guide](developers-guide.md).

## Prereqs

1.  Install XCode.

1.  Run `./bin/build` to build the latest version of the uberjar.

1.  Next, you'll need to run the following commands before building the app:

    ```bash
      # Fetch and initialize git submodule
      git submodule update --init

      # Install Perl modules used by ./bin/osx-setup and ./bin/osx-release
      # You may have to run this as sudo if you didn't upgrade perl as described in step above
      cpan install File::Copy::Recursive Readonly String::Util Text::Caml

      # Copy JRE and uberjar
      ./bin/osx-setup
    ```

`./bin/osx-setup` will build run commands to build the uberjar for you if needed.
Run `./bin/osx-setup` again at any time in the future to copy the latest version of the uberjar into the project.

(If the script fails near the end, you can just copy the JARs in question to `OSX/Resources/metabase.jar` and `OSX/Resources/reset-password.jar`.)

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

You'll probably also want an Apple Developer ID Application Certificate in your computer's keychain. You'll need to generate a Certificate Signing Request from Keychain Access, and have Sameer go to [the Apple Developer Site](https://developer.apple.com/account/mac/certificate/) and generate one for you, then load the file on your computer.

After that, you are good to go:
```bash
# Bundle entire app, and upload to s3
./bin/osx-release
```
