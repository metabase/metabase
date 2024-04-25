import cx from "classnames";
import { useCallback } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { isTableDisplay } from "metabase/lib/click-behavior";
import type { IconName } from "metabase/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type {
  QuestionDashboardCard,
  ArbitraryCustomDestinationClickBehavior,
  ClickBehavior,
  CustomDestinationClickBehavior,
  CustomDestinationClickBehaviorLinkType,
} from "metabase-types/api";

import { SidebarContent } from "../ClickBehaviorSidebar.styled";

import { CustomLinkText } from "./CustomLinkText";
import { CustomURLPicker } from "./CustomURLPicker";
import { LinkOption } from "./LinkOption";
import { LinkedEntityPicker } from "./LinkedEntityPicker/LinkedEntityPicker";
import { ValuesYouCanReference } from "./ValuesYouCanReference";

type LinkTypeOption = {
  type: CustomDestinationClickBehaviorLinkType;
  icon: IconName;
  name: string;
};

function LinkTypeOptions({
  onSelect,
}: {
  onSelect: (type: CustomDestinationClickBehaviorLinkType) => void;
}) {
  const linkTypeOptions: LinkTypeOption[] = [
    { type: "dashboard", icon: "dashboard", name: t`Dashboard` },
    { type: "question", icon: "bar", name: t`Saved question` },
    { type: "url", icon: "link", name: t`URL` },
  ];
  return (
    <>
      {linkTypeOptions.map(({ type, icon, name }) => (
        <LinkOption
          key={name}
          option={name}
          icon={icon}
          onClick={() => onSelect(type)}
        />
      ))}
    </>
  );
}

interface Props {
  clickBehavior: CustomDestinationClickBehavior;
  dashcard: QuestionDashboardCard;
  parameters: UiParameter[];
  updateSettings: (settings: Partial<ClickBehavior>) => void;
}

export function LinkOptions({
  clickBehavior,
  dashcard,
  parameters,
  updateSettings,
}: Props) {
  const hasSelectedLinkType = clickBehavior.linkType != null;

  const handleSelectLinkType = useCallback(
    (type: CustomDestinationClickBehaviorLinkType) =>
      updateSettings({ type: clickBehavior.type, linkType: type }),
    [clickBehavior, updateSettings],
  );

  return (
    <SidebarContent>
      <p className={cx(CS.textMedium, CS.mt3, CS.mb1)}>{t`Link to`}</p>
      <div>
        {!hasSelectedLinkType ? (
          <LinkTypeOptions onSelect={handleSelectLinkType} />
        ) : clickBehavior.linkType === "url" ? (
          <CustomURLPicker
            clickBehavior={clickBehavior}
            updateSettings={updateSettings}
            dashcard={dashcard}
            parameters={parameters}
          />
        ) : null}
      </div>
      <div className={CS.mt1}>
        {hasSelectedLinkType && clickBehavior.linkType !== "url" && (
          <div>
            <LinkedEntityPicker
              dashcard={dashcard}
              clickBehavior={clickBehavior}
              updateSettings={updateSettings}
            />
            {isTableDisplay(dashcard) && (
              <div>
                <CustomLinkText
                  updateSettings={updateSettings}
                  clickBehavior={
                    clickBehavior as unknown as ArbitraryCustomDestinationClickBehavior
                  }
                />
                <ValuesYouCanReference
                  dashcard={dashcard}
                  parameters={parameters}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </SidebarContent>
  );
}
