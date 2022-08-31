/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import _ from "underscore";

import { isTableDisplay } from "metabase/lib/click-behavior";

import CustomLinkText from "./CustomLinkText";
import QuestionDashboardPicker from "./QuestionDashboardPicker";
import { SidebarContent } from "../ClickBehaviorSidebar.styled";

import CustomURLPicker from "./CustomURLPicker";
import LinkOption from "./LinkOption";
import ValuesYouCanReference from "./ValuesYouCanReference";

function LinkTypeOptions({ onSelect }) {
  const linkTypeOptions = [
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

function LinkOptions({ clickBehavior, updateSettings, dashcard, parameters }) {
  const hasSelectedLinkType = clickBehavior.linkType != null;

  const handleSelectLinkType = type =>
    updateSettings({ type: clickBehavior.type, linkType: type });

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
        ) : (
          <div></div>
        )}
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
                  clickBehavior={clickBehavior}
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
