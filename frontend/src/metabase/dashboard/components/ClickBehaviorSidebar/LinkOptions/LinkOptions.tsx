import React, { useCallback } from "react";
import { t } from "ttag";

import { isTableDisplay } from "metabase/lib/click-behavior";

import CustomLinkText from "./CustomLinkText";
import QuestionDashboardPicker from "./QuestionDashboardPicker";
import { SidebarContent } from "../ClickBehaviorSidebar.styled";

import type { UiParameter } from "metabase/parameters/types";
import type {
  DashboardOrderedCard,
  ArbitraryCustomDestinationClickBehavior,
  ClickBehavior,
  CustomDestinationClickBehavior,
  CustomDestinationClickBehaviorLinkType,
} from "metabase-types/api";

import CustomURLPicker from "./CustomURLPicker";
import LinkOption from "./LinkOption";
import ValuesYouCanReference from "./ValuesYouCanReference";

type LinkTypeOption = {
  type: CustomDestinationClickBehaviorLinkType;
  icon: string;
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
  dashcard: DashboardOrderedCard;
  parameters: UiParameter[];
  updateSettings: (settings: Partial<ClickBehavior>) => void;
}

function LinkOptions({
  clickBehavior,
  dashcard,
  parameters,
  updateSettings,
}: Props) {
  const hasSelectedLinkType = clickBehavior.linkType != null;

  const handleSelectLinkType = useCallback(
    type => updateSettings({ type: clickBehavior.type, linkType: type }),
    [clickBehavior, updateSettings],
  );

  return (
    <SidebarContent>
      <p className="text-medium mt3 mb1">{t`Link to`}</p>
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
      <div className="mt1">
        {hasSelectedLinkType && clickBehavior.linkType !== "url" && (
          <div>
            <QuestionDashboardPicker
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

export default LinkOptions;
