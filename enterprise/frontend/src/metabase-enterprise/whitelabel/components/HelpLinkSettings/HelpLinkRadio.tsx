import { t } from "ttag";
import { useCallback } from "react";
import { Radio, Stack } from "metabase/ui";

interface Props {
  setting: { value: string };
  onChange: (value: string) => void;
}

export const HelpLinkRadio = ({ setting, onChange }: Props) => {
  const focusUrlInput = useCallback(async () => {
    // The url input is rendered only after the setting is saved and returned from the BE
    // there's no easy way to autofocus it from here besides waiting.
    // `autofocus` can't be used otherwise it will be autofocused also on page load
    const input = await waitFor(() =>
      document.querySelector<HTMLInputElement>(
        "#setting-help-link-custom-destination",
      ),
    );
    input?.focus();
  }, []);

  return (
    <Radio.Group value={setting.value} onChange={onChange}>
      <Stack>
        <Radio label={t`Link to Metabase help`} value={"metabase_default"} />
        <Radio label={t`Hide it`} value={"hidden"} />
        <Radio
          label={t`Go to a custom destination...`}
          value={"custom"}
          onClick={focusUrlInput}
        />
      </Stack>
    </Radio.Group>
  );
};

/**
 * Wait for `condition` to return truthy and returns its value
 * Checks every `interval` ms and times out after `timeout` ms
 */
const waitFor = <T,>(
  condition: () => T,
  { interval = 10, timeout = 5000 } = {},
) => {
  return new Promise<T>(resolve => {
    const timeoutId = setTimeout(() => {
      clearInterval(intervalId);
    }, timeout);
    const intervalId = setInterval(() => {
      const value = condition();
      if (value) {
        clearInterval(intervalId);
        clearTimeout(timeoutId);
        resolve(value);
      }
    }, interval);
  });
};
