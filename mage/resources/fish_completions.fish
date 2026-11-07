function __mage_complete_tasks
  if not test "$__mage_tasks"
    set -g __mage_tasks (bb --config (__mage_root)/bb.edn tasks 2>/dev/null |tail -n +3 |cut -f1 -d ' ')
  end

  printf "%s\n" $__mage_tasks
end

complete -c mage -a "(__mage_complete_tasks)" -d 'tasks'
