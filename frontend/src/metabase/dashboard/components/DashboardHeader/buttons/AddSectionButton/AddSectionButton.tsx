import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { SectionLayoutPreview } from "metabase/dashboard/components/DashboardHeader/SectionLayoutPreview";
import { useDashboardContext } from "metabase/dashboard/context/context";
import { type SectionLayout, layoutOptions } from "metabase/dashboard/sections";
import { darken } from "metabase/lib/colors";
import { Flex, Menu } from "metabase/ui";

import AddSectionButtonS from "./AddSectionButton.module.css";

export const AddSectionButton = () => {
  const { dashboard, selectedTabId, addSectionToDashboard } =
    useDashboardContext();

  const onAddSection = (sectionLayout: SectionLayout) => {
    if (dashboard) {
      addSectionToDashboard({
        dashId: dashboard.id,
        tabId: selectedTabId,
        sectionLayout,
      });
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
