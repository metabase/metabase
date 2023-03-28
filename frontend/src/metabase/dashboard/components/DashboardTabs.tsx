import React from "react";

import TabRow from "metabase/core/components/TabRow";
import { Container, TabButton, Button } from "./DashboardTabs.styled";

interface DashboardTabsProps {
  isEditing: boolean;
}

export function DashboardTabs({ isEditing }: DashboardTabsProps) {
  if (!isEditing) {
    return null;
  }

  return (
    <Container>
      <TabRow>
        <TabButton>Overview</TabButton>
        <TabButton>By region</TabButton>
      </TabRow>
      <Button icon="add" iconSize={12} onClick={() => console.log("clicked")} />
    </Container>
  );
}
