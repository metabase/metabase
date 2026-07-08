export MB_DIR="{{mb-dir}}"
# alias:
mage() {
  cd $MB_DIR && ./bin/mage "$@"
}

# autocomplete:
_bb_tasks() {
    local matches=(`bb tasks |tail -n +3 |cut -f1 -d ' '`)
    compadd -a matches
    _files # autocomplete filenames as well
}
compdef _bb_tasks mage
