#!/bin/bash

version="5"
ssl=""

OPTIND=1
while getopts "hs:v:" opt
do
    case "$opt" in
        h|\?)
            echo "Usage: run-server.sh [-s plain|tls] [-v 4.2|5]" 1>&2
            exit 0
            ;;
        s)
            ssl=$OPTARG
            ;;
        v)
            version=$OPTARG
            ;;
    esac
done
shift $((OPTIND-1))
[ "${1:-}" = "--" ] && shift

if [ "${ssl}" == "" ]
then
    ssl="tls"
fi

params=()
if [ "${ssl}" == "tls" ]
then
    params=(--tlsMode requireTLS --tlsCertificateKeyFile /etc/mongo/metamongo.pem --tlsCAFile /etc/mongo/metaca.crt)
fi

echo "Running mongod version ${version} in SSL mode ${ssl}"

docker run -d -it --rm -p 27017:27017 --name metamongo metabase/qa-databases:mongo-sample-${version} \
       mongod --dbpath /data/db2/ "${params[@]}"

for f in metabase.crt metabase.key metaca.crt
do
    docker cp metamongo:/etc/mongo/$f .
done
