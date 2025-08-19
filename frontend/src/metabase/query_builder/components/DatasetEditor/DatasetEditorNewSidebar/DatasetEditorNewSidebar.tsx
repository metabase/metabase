import { SegmentedControl, Stack, Title, Text } from "metabase/ui";
import { t } from "ttag";
type DatasetEditorNewSidebarProps = {
  onUpdateSettings: (settings: any) => void;
  settings: any;
};
export const DatasetEditorNewSidebar = ({
  onUpdateSettings,
  settings = {},
}: DatasetEditorNewSidebarProps) => {
  if (!settings) return null;

  return (
    <Stack p="1.25rem 1.5rem">
      <Text size="md" fw="bold">{t`Model Settings`}</Text>

      <Stack>
        <Text size="md">{t`What should the default view of this data be?`}</Text>
        <SegmentedControl
          data={[
            { value: "table", label: t`Table` },
            { value: "list", label: t`List` },
          ]}
          value={settings.viewSettings?.defaultView ?? "table"}
          onChange={(value) =>
            onUpdateSettings({ viewSettings: { defaultView: value } })
          }
        />
      </Stack>
    </Stack>
  );
};
