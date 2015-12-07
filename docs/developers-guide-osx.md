# Metabase OS X App

## Prereqs

You'll need to run the following commands before building the app:

```bash
# Fetch and initialize git submodule
git submodule update --init

# Install libcurl (needed by WWW::Curl::Simple)
brew install curl && brew link curl --force

# Install Perl modules used by ./setup and ./release
sudo cpan install File::Copy::Recursive JSON Readonly String::Util Text::Caml WWW::Curl::Simple

# Copy JRE and uberjar
./bin/osx-setup
```

`./bin/osx-setup` will build run commands to build the uberjar for you if needed.
Run `./bin/osx-setup` again at any time in the future to copy the latest version of the uberjar into the project.


## Releasing

A handy Perl script called `./bin/osx-release` takes care of all of the details for you. Before you run it for the first time, you'll need to set up a few additional things:

```bash
# Configure AWS Credentials
# You'll need credentials that give you permission to write the metabase-osx-releases S3 bucket.
aws configure --profile metabase

# Copy & Edit Config file
cp bin/config.json.template bin/config.json
emacs bin/config.json

# Obtain a copy of the private key used for signing the app (ask Cam)
# and put a copy of it at ./dsa_priv.pem
cp /path/to/private/key.pem OSX/dsa_priv.pem
```

You'll probably also want an Apple Developer ID Application Certificate in your computer's keychain (ask Cam).

After that, you are good to go:
```bash
# Bundle entire app, and upload to s3
./release
```
