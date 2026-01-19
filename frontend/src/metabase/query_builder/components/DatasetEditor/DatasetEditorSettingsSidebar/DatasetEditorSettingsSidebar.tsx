import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { setUIControls } from "metabase/query_builder/actions";
import {
  getIsListViewConfigurationShown,
  getTransformedSeries,
} from "metabase/query_builder/selectors";
import { Button, Group, SegmentedControl, Stack, Text } from "metabase/ui";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { CardDisplayType } from "metabase-types/api";

import { ListViewColumnsSidebar } from "./ListViewColumnsSidebar";

export type ModelSettings = {
  display: CardDisplayType;
  visualizationSettings: ComputedVisualizationSettings;
};
type DatasetEditorSettingsSidebarProps = {
  onUpdateModelSettings: (settings: { display: CardDisplayType }) => void;
  visualizationSettings: ComputedVisualizationSettings;
  display?: CardDisplayType;
};
export const DatasetEditorSettingsSidebar = ({
  onUpdateModelSettings: onUpdateSettings,
  visualizationSettings = {},
  display,
}: DatasetEditorSettingsSidebarProps) => {
  const dispatch = useDispatch();
  const isShowingListViewConfiguration = useSelector(
    getIsListViewConfigurationShown,
  );
  const series = useSelector(getTransformedSeries);
  const cols = series?.[0]?.data?.cols ?? [];

  if (display === "list" && isShowingListViewConfiguration) {
    return (
      <ListViewColumnsSidebar
        cols={cols}
        settings={visualizationSettings}
        onDone={() =>
          dispatch(setUIControls({ isShowingListViewConfiguration: false }))
        }
      />
    );
  }

  return (
    <Stack p="2.5rem">
      <Group justify="space-between" align="center" h="2rem">
        <Text size="md" fw="bold">{t`Model Settings`}</Text>
      </Group>

      <Stack gap="sm">
        <Text size="md">{t`What should the default view of this data be?`}</Text>
        <Stack gap="sm">
          <SegmentedControl
            data={[
              { value: "table", label: t`Table` },
              { value: "list", label: t`List` },
            ]}
            value={display}
            onChange={(value) => {
              onUpdateSettings({ display: value as "table" | "list" });
              dispatch(
                setUIControls({ isShowingListViewConfiguration: false }),
              );
            }}
          />
          {display === "list" && (
            <Button
              variant="default"
              onClick={() =>
                dispatch(
                  setUIControls({ isShowingListViewConfiguration: true }),
                )
              }
            >{t`Customize the List layout`}</Button>
          )}
        </Stack>
      </Stack>
    </Stack>
  );
};
