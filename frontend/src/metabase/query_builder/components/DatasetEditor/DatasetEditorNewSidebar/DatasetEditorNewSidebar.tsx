import { useMemo } from "react";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { setUIControls } from "metabase/query_builder/actions";
import { getIsListViewConfigurationShown } from "metabase/query_builder/selectors";
import { Button, SegmentedControl, Stack, Text } from "metabase/ui";
import type { RawSeries } from "metabase-types/api";

import { ListViewColumnsCustomization } from "./ListViewColumnsCustomization";

type DatasetEditorNewSidebarProps = {
  onUpdateSettings: (settings: any) => void;
  settings: any;
  rawSeries: RawSeries;
};
export const DatasetEditorNewSidebar = ({
  onUpdateSettings,
  settings = {},
  rawSeries,
}: DatasetEditorNewSidebarProps) => {
  const dispatch = useDispatch();
  const isShowingListViewConfiguration = useSelector(
    getIsListViewConfigurationShown,
  );
  const currentView = settings?.viewSettings?.defaultView ?? "table";
  const cols = useMemo(() => rawSeries[0]?.data?.cols, [rawSeries]);

  if (currentView === "list" && isShowingListViewConfiguration) {
    return (
      <ListViewColumnsCustomization
        cols={cols}
        settings={settings}
        onDone={() =>
          dispatch(setUIControls({ isShowingListViewConfiguration: false }))
        }
      />
    );
  }

  return (
    <Stack p="2.5rem">
      <Text size="md" fw="bold">{t`Model Settings`}</Text>

      <Stack>
        <Text size="md">{t`What should the default view of this data be?`}</Text>
        <Stack gap="sm">
          <SegmentedControl
            data={[
              { value: "table", label: t`Table` },
              { value: "list", label: t`List` },
            ]}
            value={currentView}
            onChange={(value) => {
              onUpdateSettings({ viewSettings: { defaultView: value } });
              dispatch(
                setUIControls({ isShowingListViewConfiguration: false }),
              );
            }}
          />
          {currentView === "list" && (
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
