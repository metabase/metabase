function __mage_complete_tasks
  if not test "$__mage_tasks"
    if test -n "$MB_DIR"
      set -g __mage_tasks (cd $MB_DIR && bb tasks 2>/dev/null |tail -n +3 |cut -f1 -d ' ')
    end
  end

  printf "%s\n" $__mage_tasks
end

complete -c mage -a "(__mage_complete_tasks)" -d 'tasks'
