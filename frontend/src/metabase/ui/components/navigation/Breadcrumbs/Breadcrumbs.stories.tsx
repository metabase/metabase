import { Link } from "metabase/common/components/Link";
import { Breadcrumbs, Icon } from "metabase/ui";

const DefaultTemplate = () => (
  <Breadcrumbs separator={<Icon size={12} name="chevronright" />}>
    <Link to="#">Root</Link>
    <Link to="#">Nested</Link>
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
