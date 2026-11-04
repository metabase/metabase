export MB_DIR="{{mb-dir}}"
# the checkout you're in, else $MB_DIR:
_mage_root() {
  local root
  root=$(git rev-parse --show-toplevel 2>/dev/null)
  if [ -x "$root/bin/mage" ]; then echo "$root"; else echo "$MB_DIR"; fi
}
# alias:
mage() {
  "$(_mage_root)/bin/mage" "$@"
}

# autocomplete:
_bb_tasks() {
    local matches=(`bb --config "$(_mage_root)/bb.edn" tasks |tail -n +3 |cut -f1 -d ' '`)
    compadd -a matches
    _files # autocomplete filenames as well
}
compdef _bb_tasks mage
