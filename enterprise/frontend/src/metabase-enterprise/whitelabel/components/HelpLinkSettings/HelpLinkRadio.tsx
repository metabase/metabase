import { t } from "ttag";
import { Radio, Stack } from "metabase/ui";
import type { HomeLinkSetting } from "metabase-types/api";

interface Props {
  setting: { value?: HomeLinkSetting; default: HomeLinkSetting };
  onChange: (value: string) => void;
}

export const HelpLinkRadio = ({ setting, onChange }: Props) => {
  return (
    <Radio.Group value={setting.value || setting.default} onChange={onChange}>
      <Stack>
        <Radio label={t`Link to Metabase help`} value={"metabase_default"} />
        <Radio label={t`Hide it`} value={"hidden"} />
        <Radio label={t`Go to a custom destination...`} value={"custom"} />
      </Stack>
    </Radio.Group>
  );
};
