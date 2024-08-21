import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { addSectionToDashboard } from "metabase/dashboard/actions";
import { SectionLayoutPreview } from "metabase/dashboard/components/DashboardHeader/SectionLayoutPreview";
import { type SectionLayout, layoutOptions } from "metabase/dashboard/sections";
import { getDashboard, getSelectedTabId } from "metabase/dashboard/selectors";
import { darken } from "metabase/lib/colors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Flex, Menu } from "metabase/ui";

import AddSectionButtonS from "./AddSectionButton.module.css";

export const AddSectionButton = () => {
  const dispatch = useDispatch();
  const dashboard = useSelector(getDashboard);
  const selectedTabId = useSelector(getSelectedTabId);
  const onAddSection = (sectionLayout: SectionLayout) => {
    if (dashboard) {
      dispatch(
        addSectionToDashboard({
          dashId: dashboard.id,
          tabId: selectedTabId,
          sectionLayout,
        }),
      );
    }
  };
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ToolbarButton
          tooltipLabel={t`Add section`}
          aria-label={t`Add section`}
          icon="section"
        />
      </Menu.Target>
      <Menu.Dropdown miw="100px">
        <Flex
          direction="column"
          align="center"
          gap="md"
          p="12px"
          className={AddSectionButtonS.AddSectionButton}
        >
          {layoutOptions.map(layout => (
            <Menu.Item
              key={layout.id}
              bg={darken("bg-medium", 0.1)}
              onClick={() => onAddSection(layout)}
              aria-label={layout.label}
              p="14px"
            >
              <SectionLayoutPreview layout={layout} />
            </Menu.Item>
          ))}
        </Flex>
      </Menu.Dropdown>
    </Menu>
  );
};
