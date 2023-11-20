import { t } from "ttag";
import { useCallback } from "react";
import { Radio, Stack } from "metabase/ui";

interface Props {
  setting: { value: string };
  onChange: (value: string) => void;
}

export const HelpLinkRadio = ({ setting, onChange }: Props) => {
  const focusNextInput = useCallback(async () => {
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
          onClick={focusNextInput}
        />
      </Stack>
    </Radio.Group>
  );
};

const waitFor = <T,>(condition: () => T) => {
  return new Promise<T>(resolve => {
    const intervalId = setInterval(() => {
      const value = condition();
      if (value) {
        clearInterval(intervalId);
        resolve(value);
      }
    }, 10);
  });
};
