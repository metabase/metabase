import React from "react";
import PageHeader from "./PageHeader";
import Subhead from "metabase/components/type/Subhead";
import Icon from "metabase/components/Icon";
import { Flex } from "grid-styled";

import Radio from "metabase/components/Radio";

const PageTabs = ({ children }) => <div>{children}</div>;

export const component = PageHeader;
export const category = "admin";
export const description = `Layout recipes for admin page headers`;

const PageTools = ({ children }) => <Flex align="center">{children}</Flex>;

const PageActions = ({ children }) => (
  <Flex align="center" ml="auto">
    {children}
  </Flex>
);

export const examples = {
  "": (
    <PageHeader>
      <Subhead>Database listing page</Subhead>
    </PageHeader>
  ),
  withAction: (
    <PageHeader>
      <PageTools>
        <Subhead>Database listing page</Subhead>
        <PageActions>
          <Icon name="add" />
        </PageActions>
      </PageTools>
    </PageHeader>
  ),
  withTabs: (
    <PageHeader>
      <Subhead>Tabbed page</Subhead>
      <PageTabs>
        <Radio
          options={[
            {
              name: "Subsection 1",
              value: 1,
            },
            {
              name: "Subsection 2",
              value: 2,
            },
          ]}
          value={1}
          underlined
        />
      </PageTabs>
    </PageHeader>
  ),
};
