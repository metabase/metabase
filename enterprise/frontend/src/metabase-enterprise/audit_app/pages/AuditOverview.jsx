import React from "react";

import AuditContent from "../components/AuditContent";
import AuditDashboard from "../containers/AuditDashboard";

import * as UsersCards from "../lib/cards/users";

type Props = {
  params: { [key: string]: string },
};

const AuditOverview = (props: Props) => (
  <AuditContent {...props} title="Overview">
    <AuditDashboard
      cards={[
        [{ x: 0, y: 0, w: 18, h: 9 }, UsersCards.activeUsersAndQueriesByDay()],
        [{ x: 0, y: 9, w: 18, h: 9 }, UsersCards.mostActive()],
      ]}
    />
  </AuditContent>
);

export default AuditOverview;
