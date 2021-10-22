import React from "react";

import Breadcrumbs from "metabase/components/Breadcrumbs";

export const component = Breadcrumbs;
export const category = "navigation";

export const description = `
Breadcrumbs to help user get know where they are and to parent pages.
`;

const crumbs = [
  ["Hello", () => alert("action can be a function")],
  ["World", "/or a url"],
  ["Foo"],
];

export const examples = {
  default: <Breadcrumbs crumbs={crumbs} />,
  "sidebar variant": <Breadcrumbs crumbs={crumbs} inSidebar />,
};
