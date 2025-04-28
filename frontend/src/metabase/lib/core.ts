import { t } from "ttag";

import type { IconName } from "metabase/ui";
import { TYPE } from "metabase-lib/v1/types/constants";
import type { Field } from "metabase-types/api";

interface FieldSemanticType {
  id: NonNullable<Field["semantic_type"]>;
  name: string;
  section: string;
  description?: string;
  icon: IconName;
  deprecated?: boolean;
}

export const FIELD_SEMANTIC_TYPES: FieldSemanticType[] = [
  /* Overall Row */
  {
    id: TYPE.PK,
    get name() {
      return t`Entity Key`;
    },
    get section() {
      return t`Overall Row`;
    },
    get description() {
      return t`The primary key for this table.`;
    },
    icon: "label",
  },
  {
    id: TYPE.Name,
    get name() {
      return t`Entity Name`;
    },
    get section() {
      return t`Overall Row`;
    },
    get description() {
      return t`The "name" of each record. Usually a column called "name", "title", etc.`;
    },
    icon: "string",
  },
  {
    id: TYPE.FK,
    get name() {
      return t`Foreign Key`;
    },
    get section() {
      return t`Overall Row`;
    },
    get description() {
      return t`Points to another table to make a connection.`;
    },
    icon: "connections",
  },

  /* Common */
  {
    id: TYPE.Category,
    get name() {
      return t`Category`;
    },
    get section() {
      return t`Common`;
    },
    icon: "string",
  },
  {
    id: TYPE.Comment,
    get name() {
      return t`Comment`;
    },
    get section() {
      return t`Common`;
    },
    icon: "string",
    deprecated: true,
  },
  {
    id: TYPE.Description,
    get name() {
      return t`Description`;
    },
    get section() {
      return t`Common`;
    },
    icon: "string",
    deprecated: true,
  },
  {
    id: TYPE.Title,
    get name() {
      return t`Title`;
    },
    get section() {
      return t`Common`;
    },
    icon: "string",
  },

  /* Location */
  {
    id: TYPE.City,
    get name() {
      return t`City`;
    },
    get section() {
      return t`Location`;
    },
    icon: "location",
  },
  {
    id: TYPE.Country,
    get name() {
      return t`Country`;
    },
    get section() {
      return t`Location`;
    },
    icon: "location",
  },
  {
    id: TYPE.Latitude,
    get name() {
      return t`Latitude`;
    },
    get section() {
      return t`Location`;
    },
    icon: "location",
  },
  {
    id: TYPE.Longitude,
    get name() {
      return t`Longitude`;
    },
    get section() {
      return t`Location`;
    },
    icon: "location",
  },
  {
    id: TYPE.State,
    get name() {
      return t`State`;
    },
    get section() {
      return t`Location`;
    },
    icon: "location",
  },
  {
    id: TYPE.ZipCode,
    get name() {
      return t`Zip Code`;
    },
    get section() {
      return t`Location`;
    },
    icon: "location",
  },

  /* Financial */
  {
    id: TYPE.Cost,
    get name() {
      return t`Cost`;
    },
    get section() {
      return t`Financial`;
    },
    icon: "int",
    deprecated: true,
  },
  {
    id: TYPE.Currency,
    get name() {
      return t`Currency`;
    },
    get section() {
      return t`Financial`;
    },
    icon: "int",
  },
  {
    id: TYPE.Discount,
    get name() {
      return t`Discount`;
    },
    get section() {
      return t`Financial`;
    },
    icon: "int",
  },
  {
    id: TYPE.GrossMargin,
    get name() {
      return t`Gross margin`;
    },
    get section() {
      return t`Financial`;
    },
    icon: "int",
    deprecated: true,
  },
  {
    id: TYPE.Income,
    get name() {
      return t`Income`;
    },
    get section() {
      return t`Financial`;
    },
    icon: "int",
  },
  {
    id: TYPE.Price,
    get name() {
      return t`Price`;
    },
    get section() {
      return t`Financial`;
    },
    icon: "int",
    deprecated: true,
  },

  /* Numeric */
  {
    id: TYPE.Quantity,
    get name() {
      return t`Quantity`;
    },
    get section() {
      return t`Numeric`;
    },
    icon: "int",
  },
  {
    id: TYPE.Score,
    get name() {
      return t`Score`;
    },
    get section() {
      return t`Numeric`;
    },
    icon: "int",
  },
  {
    id: TYPE.Share,
    get name() {
      return t`Share`;
    },
    get section() {
      return t`Numeric`;
    },
    icon: "int",
    deprecated: true,
  },
  {
    id: TYPE.Percentage,
    get name() {
      return t`Percentage`;
    },
    get section() {
      return t`Numeric`;
    },
    icon: "int",
  },

  /* Profile */
  {
    id: TYPE.Birthdate,
    get name() {
      return t`Birthday`;
    },
    get section() {
      return t`Profile`;
    },
    icon: "birthday",
  },
  {
    id: TYPE.Company,
    get name() {
      return t`Company`;
    },
    get section() {
      return t`Profile`;
    },
    icon: "string",
    deprecated: true,
  },
  {
    id: TYPE.Email,
    get name() {
      return t`Email`;
    },
    get section() {
      return t`Profile`;
    },
    icon: "string",
  },
  {
    id: TYPE.Owner,
    get name() {
      return t`Owner`;
    },
    get section() {
      return t`Profile`;
    },
    icon: "string",
    deprecated: true,
  },
  {
    id: TYPE.Subscription,
    get name() {
      return t`Subscription`;
    },
    get section() {
      return t`Profile`;
    },
    icon: "string",
    deprecated: true,
  },
  {
    id: TYPE.User,
    get name() {
      return t`User`;
    },
    get section() {
      return t`Profile`;
    },
    icon: "string",
  },

  /* Date and Time */
  {
    id: TYPE.CancelationDate,
    get name() {
      return t`Cancelation date`;
    },
    get section() {
      return t`Date and Time`;
    },
    icon: "calendar",
    deprecated: true,
  },
  {
    id: TYPE.CancelationTime,
    get name() {
      return t`Cancelation time`;
    },
    get section() {
      return t`Date and Time`;
    },
    icon: "calendar",
    deprecated: true,
  },
  {
    id: TYPE.CancelationTimestamp,
    get name() {
      return t`Cancelation timestamp`;
    },
    get section() {
      return t`Date and Time`;
    },
    icon: "calendar",
    deprecated: true,
  },
  {
    id: TYPE.CreationDate,
    get name() {
      return t`Creation date`;
    },
    get section() {
      return t`Date and Time`;
    },
    icon: "calendar",
  },
  {
    id: TYPE.CreationTime,
    get name() {
      return t`Creation time`;
    },
    get section() {
      return t`Date and Time`;
    },
    icon: "calendar",
  },
  {
    id: TYPE.CreationTimestamp,
    get name() {
      return t`Creation timestamp`;
    },
    get section() {
      return t`Date and Time`;
    },
    icon: "calendar",
  },
  {
    id: TYPE.DeletionDate,
    get name() {
      return t`Deletion date`;
    },
    get section() {
      return t`Date and Time`;
    },
    icon: "calendar",
    deprecated: true,
  },
  {
    id: TYPE.DeletionTime,
    get name() {
      return t`Deletion time`;
    },
    get section() {
      return t`Date and Time`;
    },
    icon: "calendar",
    deprecated: true,
  },
  {
    id: TYPE.DeletionTimestamp,
    get name() {
      return t`Deletion timestamp`;
    },
    get section() {
      return t`Date and Time`;
    },
    icon: "calendar",
    deprecated: true,
  },
  {
    id: TYPE.UpdatedDate,
    get name() {
      return t`Updated date`;
    },
    get section() {
      return t`Date and Time`;
    },
    icon: "calendar",
    deprecated: true,
  },
  {
    id: TYPE.UpdatedTime,
    get name() {
      return t`Updated time`;
    },
    get section() {
      return t`Date and Time`;
    },
    icon: "calendar",
    deprecated: true,
  },
  {
    id: TYPE.UpdatedTimestamp,
    get name() {
      return t`Updated timestamp`;
    },
    get section() {
      return t`Date and Time`;
    },
    icon: "calendar",
    deprecated: true,
  },
  {
    id: TYPE.JoinDate,
    get name() {
      return t`Join date`;
    },
    get section() {
      return t`Date and Time`;
    },
    icon: "calendar",
  },
  {
    id: TYPE.JoinTime,
    get name() {
      return t`Join time`;
    },
    get section() {
      return t`Date and Time`;
    },
    icon: "calendar",
  },
  {
    id: TYPE.JoinTimestamp,
    get name() {
      return t`Join timestamp`;
    },
    get section() {
      return t`Date and Time`;
    },
    icon: "calendar",
  },

  /* Categorical */
  {
    id: TYPE.Enum,
    get name() {
      return t`Enum`;
    },
    get section() {
      return t`Categorical`;
    },
    icon: "string",
    deprecated: true,
  },
  {
    id: TYPE.Product,
    get name() {
      return t`Product`;
    },
    get section() {
      return t`Categorical`;
    },
    icon: "string",
  },
  {
    id: TYPE.Source,
    get name() {
      return t`Source`;
    },
    get section() {
      return t`Categorical`;
    },
    icon: "string",
  },

  /* URLs */
  {
    id: TYPE.AvatarURL,
    get name() {
      return t`Avatar Image URL`;
    },
    get section() {
      return t`URLs`;
    },
    icon: "string",
  },
  {
    id: TYPE.ImageURL,
    get name() {
      return t`Image URL`;
    },
    get section() {
      return t`URLs`;
    },
    icon: "string",
  },
  {
    id: TYPE.URL,
    get name() {
      return t`URL`;
    },
    get section() {
      return t`URLs`;
    },
    icon: "string",
  },

  /* Other */
  {
    id: TYPE.SerializedJSON,
    get name() {
      return t`Field containing JSON`;
    },
    get section() {
      return t`Other`;
    },
    icon: "string",
  },
];

export const FIELD_SEMANTIC_TYPES_MAP = FIELD_SEMANTIC_TYPES.reduce(
  (map, type) => Object.assign({}, map, { [type.id]: type }),
  {},
);

export const HAS_FIELD_VALUES_OPTIONS = [
  {
    get name() {
      return t`Search box`;
    },
    value: "search",
  },
  {
    get name() {
      return t`A list of all values`;
    },
    value: "list",
  },
  {
    get name() {
      return t`Plain input box`;
    },
    value: "none",
  },
];

export const FIELD_VISIBILITY_TYPES = [
  {
    id: "normal",
    get name() {
      return t`Everywhere`;
    },
    get description() {
      return t`The default setting. This field will be displayed normally in tables and charts.`;
    },
  },
  {
    id: "details-only",
    get name() {
      return t`Only in detail views`;
    },
    get description() {
      return t`This field will only be displayed when viewing the details of a single record. Use this for information that's lengthy or that isn't useful in a table or chart.`;
    },
  },
  {
    id: "sensitive",
    get name() {
      return t`Do not include`;
    },
    get description() {
      return t`This field won't be visible or selectable in questions created with the GUI interfaces. It will still be accessible in SQL/native queries.`;
    },
  },
];
