import React from "react";

import { Container, Button } from "./Tabs.styled";

type Tab = {
  name: string;
  label: string | React.ReactNode;
};

type Props = {
  tabs: Tab[];
  currentTab: string;
  setCurrentTab: (tab: string) => void;
};

const Tabs: React.FC<Props> = ({ tabs, currentTab, setCurrentTab }: Props) => {
  return (
    <Container>
      {tabs.map(({ name, label }) => (
        <Button
          borderless
          key={name}
          active={currentTab === name}
          onClick={() => setCurrentTab(name)}
        >
          {label}
        </Button>
      ))}
    </Container>
  );
};

export default Tabs;
