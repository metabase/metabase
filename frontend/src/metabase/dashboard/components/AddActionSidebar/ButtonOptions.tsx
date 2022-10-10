import React, { useState } from "react";
import { t } from "ttag";

import type {
  Dashboard,
  CustomDestinationClickBehavior,
  DashboardOrderedCard,
} from "metabase-types/api";

import { BehaviorOption } from "metabase/dashboard/components/ClickBehaviorSidebar/TypeSelector/TypeSelector";
import LinkOptions from "metabase/dashboard/components/ClickBehaviorSidebar/LinkOptions";

import { hasLinkDestination } from "./utils";
import { ClickBehaviorPickerText } from "./AddActionSidebar.styled";

type ButtonType = "action" | "link" | null;

// this type depends on no properties being null, but many of the components that use it expect nulls while
// the object is buing constructed :(
const emptyClickBehavior: any = {
  type: "link",
  linkType: null,
  targetId: null,
};

export const ButtonOptions = ({
  addLink,
  closeSidebar,
  dashboard,
  ActionPicker,
}: {
  addLink: ({
    dashId,
    clickBehavior,
  }: {
    dashId: number;
    clickBehavior: CustomDestinationClickBehavior;
  }) => void;
  closeSidebar: () => void;
  dashboard: Dashboard;
  ActionPicker: React.ReactNode;
}) => {
  const [buttonType, setButtonType] = useState<ButtonType>(null);
  const [linkClickBehavior, setLinkClickBehavior] =
    useState<CustomDestinationClickBehavior>(emptyClickBehavior);

  const showLinkPicker = buttonType === "link";
  const showActionPicker = buttonType === "action";

  const handleClickBehaviorChange = (
    newClickBehavior: CustomDestinationClickBehavior,
  ) => {
    if (newClickBehavior.type !== "link") {
      return;
    }
    if (hasLinkDestination(newClickBehavior)) {
      addLink({ dashId: dashboard.id, clickBehavior: newClickBehavior });
      closeSidebar();
      return;
    }
    setLinkClickBehavior(newClickBehavior);
  };

  return (
    <>
      <ButtonTypePicker value={buttonType} onChange={setButtonType} />

      {showLinkPicker && (
        <LinkOptions
          clickBehavior={linkClickBehavior}
          dashcard={{ card: { display: "action" } } as DashboardOrderedCard} // necessary for LinkOptions to work
          parameters={[]}
          updateSettings={handleClickBehaviorChange as any}
        />
      )}
      {showActionPicker && ActionPicker}
    </>
  );
};

const ButtonTypePicker = ({
  value,
  onChange,
}: {
  value: ButtonType;
  onChange: (type: ButtonType) => void;
}) => {
  if (value) {
    return (
      <div className="mb2">
        <BehaviorOption
          option={t`Change button type`}
          selected={false}
          icon="arrow_left"
          hasNextStep={false}
          onClick={() => onChange(null)}
        />
      </div>
    );
  }

  return (
    <div>
      <ClickBehaviorPickerText>
        {t`What type of button do you want to add?`}
      </ClickBehaviorPickerText>
      <BehaviorOption
        option={t`Perform action`}
        selected={false}
        icon="play"
        hasNextStep
        onClick={() => onChange("action")}
      />
      <BehaviorOption
        option={t`Go to a custom destination`}
        selected={false}
        icon="link"
        hasNextStep
        onClick={() => onChange("link")}
      />
    </div>
  );
};
