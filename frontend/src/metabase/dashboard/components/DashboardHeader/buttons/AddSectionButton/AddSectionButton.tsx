import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { addSectionToDashboard } from "metabase/dashboard/actions";
import { SectionLayoutPreview } from "metabase/dashboard/components/DashboardHeader/SectionLayoutPreview";
import { useDashboardContext } from "metabase/dashboard/context/context";
import { type SectionLayout, layoutOptions } from "metabase/dashboard/sections";
import { useDispatch } from "metabase/lib/redux";
import { Flex, Menu } from "metabase/ui";

import AddSectionButtonS from "./AddSectionButton.module.css";

export const AddSectionButton = () => {
  const { dashboard, selectedTabId } = useDashboardContext();
  const dispatch = useDispatch();

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
          {layoutOptions.map((layout) => (
            <Menu.Item
              key={layout.id}
              bg="icon-secondary"
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
