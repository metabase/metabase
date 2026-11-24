import { useHotkeys } from "@mantine/hooks";

type UseToggleRunHotkeyOptions = {
  isEnabled: boolean;
  isRunning: boolean;
  isRunnable: boolean;
  run: () => void;
  cancel: () => void;
};

export function useToggleRunHotkey({
  isEnabled,
  isRunning,
  isRunnable,
  run,
  cancel,
}: UseToggleRunHotkeyOptions) {
  const onHotkey = () => {
    if (isRunning) {
      cancel();
    } else if (isRunnable) {
      run();
    }
  };

  useHotkeys(isEnabled ? [["mod+Enter", onHotkey]] : [], []);
}
