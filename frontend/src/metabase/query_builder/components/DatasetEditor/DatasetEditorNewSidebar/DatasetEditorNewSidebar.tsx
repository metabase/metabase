import { t } from "ttag";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { setUIControls } from "metabase/query_builder/actions";

import { Button, Flex, SegmentedControl, Stack, Text } from "metabase/ui";
import { getIsListViewConfigurationShown } from "metabase/query_builder/selectors";

type DatasetEditorNewSidebarProps = {
  onUpdateSettings: (settings: any) => void;
  settings: any;
};
export const DatasetEditorNewSidebar = ({
  onUpdateSettings,
  settings = {},
}: DatasetEditorNewSidebarProps) => {
  const dispatch = useDispatch();
  const isShowingListViewConfiguration = useSelector(
    getIsListViewConfigurationShown,
  );
  if (!settings) {
    return null;
  }

  const currentView = settings.viewSettings?.defaultView ?? "table";

  return (
    <Stack p="1.25rem 1.5rem">
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
            onChange={(value) =>
              onUpdateSettings({ viewSettings: { defaultView: value } })
            }
          />
          {currentView === "list" &&
            (!isShowingListViewConfiguration ? (
              <Button
                variant="default"
                onClick={() =>
                  dispatch(
                    setUIControls({ isShowingListViewConfiguration: true }),
                  )
                }
              >{t`Customize the List layout`}</Button>
            ) : (
              <Button
                variant="default"
                onClick={async () => {
                  dispatch(
                    setUIControls({ isShowingListViewConfiguration: false }),
                  );
                }}
              >{t`Show full list`}</Button>
            ))}
        </Stack>
      </Stack>
    </Stack>
  );
};
