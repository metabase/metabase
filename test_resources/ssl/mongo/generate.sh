#! /bin/bash

validity_days=3650

certdata () {
    local target=$1
    cat << EOF
US
CA
San Francisco
Metabase Inc.
${target}
localhost
${target}@localhost
passw
EOF
}

generate () {
    local target=$1
    openssl genrsa -out "${target}.key"
}

selfsign () {
    local target=$1
    certdata "${target}" | openssl req -new -x509 -key "${target}.key" -out "${target}.crt"
}

request () {
    local target=$1
    certdata "${target}" | openssl req -new -key "${target}.key" -out "${target}_reqout.txt"
}

sign () {
    local target=$1
    openssl x509 -req -in "${target}_reqout.txt" -days "${validity_days}" -sha256 -CAcreateserial -CA metaca.crt -CAkey metaca.key -out "${target}.crt"
}

certkey () {
    local target="$1"
    cat "${target}.crt" "${target}.key" > "${target}.pem"
}

generate metaca
selfsign metaca

for t in metamongo metabase; do
    generate $t
    request $t
    sign $t
    certkey $t
done

rm *_reqout.txt metaca.srl
