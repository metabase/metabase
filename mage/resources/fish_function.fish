set -x MB_DIR {{mb-dir}}
# the checkout you're in, else $MB_DIR:
function __mage_root
    set -l root (git rev-parse --show-toplevel 2>/dev/null)
    if test -x "$root/bin/mage"
        echo $root
    else
        echo $MB_DIR
    end
end
function mage --description 'Metabase Automation Genius Engine'
    set -l mage_bin (__mage_root)/bin/mage
    $mage_bin $argv
end
