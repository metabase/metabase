import React from "react";
import { PageHeader, PageTools, PageActions, PageTabs } from "./Page";

import Icon from "metabase/components/Icon";
import Radio from "metabase/components/Radio";
import Subhead from "metabase/components/type/Subhead";

export const component = PageHeader;
export const category = "admin";
export const description = `Layout recipes for admin page headers`;

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
