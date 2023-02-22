# Mongo server with SSL support

## Running the server

The script `run-server.sh` can be used to run the metabase-qa Mongo server in
docker. It is possible to run different versions of Mongo with different SSL
configurations (plain, ssl and tls).

## Keys and certificates

When the docker container starts, the client key and the client and CA
certificates needed for the backend tests are copied into the this directory.

Although the source of truth is the docker image, the client certificates are
checked in because there are tests like the SSL connection factory tests which
need valid certificates and keys.
