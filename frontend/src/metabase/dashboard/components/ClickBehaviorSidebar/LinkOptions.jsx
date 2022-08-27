/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import _ from "underscore";

import Button from "metabase/core/components/Button";
import Icon from "metabase/components/Icon";
import InputBlurChange from "metabase/components/InputBlurChange";
import ModalContent from "metabase/components/ModalContent";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";

import { color } from "metabase/lib/colors";
import {
  isTableDisplay,
  clickBehaviorIsValid,
} from "metabase/lib/click-behavior";

import CustomLinkText from "./CustomLinkText";
import LinkOption from "./LinkOption";
import ValuesYouCanReference from "./ValuesYouCanReference";
import QuestionDashboardPicker from "./QuestionDashboardPicker";
import { SidebarItemWrapper } from "./SidebarItem";
import {
  CloseIconContainer,
  SidebarContent,
  SidebarIconWrapper,
} from "./ClickBehaviorSidebar.styled";

function LinkOptions({ clickBehavior, updateSettings, dashcard, parameters }) {
  const linkTypeOptions = [
    { type: "dashboard", icon: "dashboard", name: t`Dashboard` },
    { type: "question", icon: "bar", name: t`Saved question` },
    { type: "url", icon: "link", name: t`URL` },
  ];

  return (
    <SidebarContent>
      <p className="text-medium mt3 mb1">{t`Link to`}</p>
      <div>
        {clickBehavior.linkType == null ? (
          linkTypeOptions.map(({ type, icon, name }, index) => (
            <LinkOption
              key={name}
              option={name}
              icon={icon}
              onClick={() =>
                updateSettings({ type: clickBehavior.type, linkType: type })
              }
            />
          ))
        ) : clickBehavior.linkType === "url" ? (
          <ModalWithTrigger
            isInitiallyOpen={clickBehavior.linkTemplate == null}
            triggerElement={
              <SidebarItemWrapper
                style={{
                  backgroundColor: color("brand"),
                  color: color("white"),
                }}
              >
                <SidebarIconWrapper
                  style={{ borderColor: "transparent", marginLeft: 8 }}
                >
                  <Icon name="link" />
                </SidebarIconWrapper>
                <div className="flex align-center full">
                  <h4 className="pr1">
                    {clickBehavior.linkTemplate
                      ? clickBehavior.linkTemplate
                      : t`URL`}
                  </h4>
                  <CloseIconContainer
                    onClick={() =>
                      updateSettings({
                        type: clickBehavior.type,
                        linkType: null,
                      })
                    }
                  >
                    <Icon name="close" size={12} />
                  </CloseIconContainer>
                </div>
              </SidebarItemWrapper>
            }
          >
            {({ onClose }) => (
              <ModalContent
                title={t`Enter a URL to link to`}
                onClose={clickBehavior.targetId != null ? onClose : null}
              >
                <div className="mb1">{t`You can insert the value of a column or dashboard filter using its name, like this: {{some_column}}`}</div>
                <InputBlurChange
                  autoFocus
                  className="input block full"
                  placeholder={t`e.g. http://acme.com/id/\{\{user_id\}\}`}
                  value={clickBehavior.linkTemplate}
                  onChange={e =>
                    updateSettings({
                      ...clickBehavior,
                      linkTemplate: e.target.value,
                    })
                  }
                />
                {isTableDisplay(dashcard) && (
                  <CustomLinkText
                    updateSettings={updateSettings}
                    clickBehavior={clickBehavior}
                  />
                )}
                <ValuesYouCanReference
                  dashcard={dashcard}
                  parameters={parameters}
                />
                <div className="flex">
                  <Button
                    primary
                    onClick={() => onClose()}
                    className="ml-auto mt2"
                    disabled={!clickBehaviorIsValid(clickBehavior)}
                  >{t`Done`}</Button>
                </div>
              </ModalContent>
            )}
          </ModalWithTrigger>
        ) : (
          <div></div>
        )}
      </div>
      <div className="mt1">
        {clickBehavior.linkType != null && clickBehavior.linkType !== "url" && (
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
