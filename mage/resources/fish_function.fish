set -x MB_DIR {{mb-dir}}
function mage --description 'Metabase Automation Genius Engine'
    cd $MB_DIR && ./bin/mage $argv
end
