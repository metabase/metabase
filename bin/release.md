## Metabase Release Script 3.0

#### Prereqs

1. Install Clojure CLI -- see [https://clojure.org/guides/getting_started]. Don't use `apt install clojure` as this
   installs a version that doesn't understand `deps.edn`.

1. Install `git`, `node`, `yarn`, `awscli`, `docker`, `java`, and `wget``

   1. For installing Docker on macOS you should use [Docker Desktop](https://docs.docker.com/docker-for-mac/install/).
      Make sure `docker ps` works from the terminal

   1. Java version must be Java 8. For managing different Java versions, I recommend
      [Jabba](https://github.com/shyiko/jabba). Use `adopt@1.8.0-<latest-version>`. Before running the script, I do

      ```
      jabba use adopt@1.8.0-252
      ```

    1. Configure AWS Credentials for `metabase` profile (used to upload artifacts to S3)

       You'll need credentials that give you permission to write the metabase-osx-releases S3 bucket. You just need
       the access key ID and secret key; use the defaults for locale and other options.

       ```
       aws configure --profile metabase
       ```

1. Export the following env vars: `DOCKERHUB_EMAIL`, `DOCKERHUB_USERNAME`, `DOCKERHUB_PASSWORD`, `GITHUB_TOKEN`,
   `SLACK_WEBHOOK_URL`, and `AWS_DEFAULT_PROFILE`.

   1. DockerHub credentials need to have permissions to push new Docker images to our DockerHub org.

   1. GitHub token needs to have push permissions

   1. You can get the Slack Webhook URL by asking Cam

   1. `AWS_DEFAULT_PROFILE` should be set to `metabase`


1.  Run the script

#### Running

```bash
./bin/release.sh
```

*or*

```bash
clojure -X:drivers:build:build/release
```

1. Debugging

If you're running into issues running the release script, it's helpful to first check that you can run `./bin/build.sh`
-- this is the real meat and potatoes of the release process and more likely to be the cause of your issues. If you
can run that but still need help, talk to Cam.

To start an nREPL (ex: to run and debug tests), use:
```
clojure -MnREPL
```

Add any JVM options (individually) by prefixing each with `-J` before the `-M`, and any additional nREPL options after
it as outlined [here](https://nrepl.org/nrepl/usage/server.html#using-clojure-cli-tools).
