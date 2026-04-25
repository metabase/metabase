import { Anchor, Breadcrumbs, Icon } from "metabase/ui";

const DefaultTemplate = () => (
  <Breadcrumbs separator={<Icon size={12} name="chevronright" />}>
    <Anchor href="#">Root</Anchor>
    <Anchor href="#">Nested</Anchor>
    <span>Leaf</span>
  </Breadcrumbs>
);

export default {
  title: "Components/Navigation/Breadcrumbs",
  component: Breadcrumbs,
};

export const Default = {
  render: DefaultTemplate,
};
