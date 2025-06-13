
## MAGE (Metabase Automation Genius Engine) alias + autocomplete. [auto-installed]
export MB_DIR="{{mb-dir}}"
# alias:
mage() {
    cd $MB_DIR && exec ./bin/mage "$@"
}
# autocomplete:
_bb_tasks() {
    COMPREPLY=( $(compgen -W "$(bb tasks |tail -n +3 |cut -f1 -d ' ')" -- ${COMP_WORDS[COMP_CWORD]}) );
}
complete -f -F _bb_tasks mage
## END MAGE [auto-installed]
