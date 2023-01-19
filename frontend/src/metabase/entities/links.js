import { createEntity } from "metabase/lib/entities";
import { LinkSchema } from "metabase/schema";

const Links = createEntity({
  name: "links",
  nameOne: "link",
  path: "/api/link",
  schema: LinkSchema,
});

export default Links;
