import React from "react";
import { t } from "ttag";

import Card from "metabase/components/Card";
import Radio from "metabase/components/Radio";
import { HeaderContainer } from "./NotificationCenterApp.styled";

const sections = [
  { name: t`Review requests`, value: "review" },
  { name: t`Resolved`, value: "resolved" },
  { name: t`Notifications`, value: "own" },
  { name: t`Activity`, value: "activity" },
];

function NotificationCenterApp() {
  const onChangeTab = () => {};

  return (
    <div>
      <HeaderContainer>
        <Radio
          underlined
          value={"own"}
          options={sections}
          onChange={onChangeTab}
        />
      </HeaderContainer>
      <div>NotificationCenterApp body</div>
    </div>
  );
}

export default NotificationCenterApp;
