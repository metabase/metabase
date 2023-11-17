import { t } from "ttag";
import { Radio, Stack } from "metabase/ui";

interface Props {
  // TODO: use real type
  setting: { value: string };
  onChange: (value: string) => void;
}

export const HelpLinkRadio = ({ setting, onChange }: Props) => {
  return (
    <Radio.Group value={setting.value} onChange={onChange}>
      <Stack>
        <Radio label={t`Link to Metabase help`} value={"metabase_default"} />
        <Radio label={t`Hide it`} value={"hidden"} />
        <Radio label={t`Go to a custom destination...`} value={"custom"} />
      </Stack>
    </Radio.Group>
  );
};
