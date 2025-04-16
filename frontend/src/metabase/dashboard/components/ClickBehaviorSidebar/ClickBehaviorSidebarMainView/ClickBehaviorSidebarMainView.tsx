import { Button, Icon } from "metabase/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type {
  ClickBehavior,
  Dashboard,
  DashboardCard,
} from "metabase-types/api";

import S from "../ClickBehaviorSidebar.module.css";
import { SidebarContent } from "../ClickBehaviorSidebarComponents";
import { CrossfilterOptions } from "../CrossfilterOptions";
import { LinkOptions } from "../LinkOptions/LinkOptions";
import LinkOptionsS from "../LinkOptions/LinkOptions.module.css";
import { SidebarItem } from "../SidebarItem";
import { useClickBehaviorOptionName } from "../hooks";
import { clickBehaviorOptions } from "../utils";

interface ClickBehaviorOptionsProps {
  clickBehavior: ClickBehavior;
  dashboard: Dashboard;
  dashcard: DashboardCard;
  parameters: UiParameter[];
  updateSettings: (settings: Partial<ClickBehavior>) => void;
}

function ClickBehaviorOptions({
  clickBehavior,
  dashboard,
  dashcard,
  parameters,
  updateSettings,
}: ClickBehaviorOptionsProps) {
  if (clickBehavior.type === "link") {
    return (
      <LinkOptions
        clickBehavior={clickBehavior}
        dashcard={dashcard}
        parameters={parameters}
        updateSettings={updateSettings}
      />
    );
  }
  if (clickBehavior.type === "crossfilter") {
    return (
      <CrossfilterOptions
        clickBehavior={clickBehavior}
        dashboard={dashboard}
        dashcard={dashcard}
        updateSettings={updateSettings}
      />
    );
  }
  return null;
}

interface ClickBehaviorSidebarMainViewProps {
  clickBehavior: ClickBehavior;
  dashboard: Dashboard;
  dashcard: DashboardCard;
  parameters: UiParameter[];
  handleShowTypeSelector: () => void;
  updateSettings: (settings: Partial<ClickBehavior>) => void;
}

export function ClickBehaviorSidebarMainView({
  clickBehavior,
  dashboard,
  dashcard,
  parameters,
  handleShowTypeSelector,
  updateSettings,
}: ClickBehaviorSidebarMainViewProps) {
  const clickBehaviorOptionName = useClickBehaviorOptionName(
    clickBehavior.type,
    dashcard,
  );
  const currentOption = clickBehaviorOptions.find(
    (o) => o.value === clickBehavior.type,
  );

  return (
    <>
      <SidebarContent className={S.SidebarContentBordered}>
        <Button.Group>
          <Button
            onClick={handleShowTypeSelector}
            leftSection={<Icon name={currentOption?.icon || "unknown"} />}
            size="lg"
            variant="filled"
            justify="flex-start"
            classNames={{
              root: LinkOptionsS.ButtonRoot,
            }}
          >
            <SidebarItem.Name>{clickBehaviorOptionName}</SidebarItem.Name>
          </Button>
          <Button
            onClick={handleShowTypeSelector}
            miw="3rem"
            size="lg"
            variant="filled"
            rightSection={<Icon name="close" />}
          />
        </Button.Group>
      </SidebarContent>

      <ClickBehaviorOptions
        clickBehavior={clickBehavior}
        dashboard={dashboard}
        dashcard={dashcard}
        parameters={parameters}
        updateSettings={updateSettings}
      />
    </>
  );
}
