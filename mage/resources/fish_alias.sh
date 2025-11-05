
## MAGE (Metabase Automation Genius Engine) alias + autocomplete. [auto-installed]
set -x MB_DIR {{mb-dir}}
function mage
    cd $MB_DIR && exec ./bin/mage $argv
end
# autocomplete:
function __bb_complete_tasks
  if not test "$__bb_tasks"
    set -g __bb_tasks (bb tasks |tail -n +3 |cut -f1 -d ' ')
  end

  printf "%s
" $__bb_tasks
end

complete -c mage -a "(__bb_complete_tasks)" -d 'tasks'
## END MAGE [auto-installed]
