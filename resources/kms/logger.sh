#!/usr/bin/env bash

PROGNAME=$(basename $0)

function log() {
    LEVEL=${1}
    MSG=${2}

    case ${LEVEL} in
        ERROR)
            echo -e "[ERROR] ${PROGNAME}: ${2:-"Unknown Error"}" 1>&2
            ;;
        INFO)
            echo -e "[INFO] \t${PROGNAME}: ${2}"
            ;;
        DEBUG)
            echo -e "[DEBUG] ${PROGNAME}: ${2}"
            ;;
        *)
            echo -e "\t${PROGNAME}: ${1}"
            ;;
    esac

}