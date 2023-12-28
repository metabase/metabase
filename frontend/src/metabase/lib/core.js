import { t } from "ttag";
import { TYPE } from "metabase-lib/types/constants";

export const field_semantic_types = [
  /* Overall Row */
  {
    id: TYPE.PK,
    name: t`Entity Key`,
    section: t`Overall Row`,
    description: t`The primary key for this table.`,
    icon: "label",
  },
  {
    id: TYPE.Name,
    name: t`Entity Name`,
    section: t`Overall Row`,
    description: t`The "name" of each record. Usually a column called "name", "title", etc.`,
    icon: "string",
  },
  {
    id: TYPE.FK,
    name: t`Foreign Key`,
    section: t`Overall Row`,
    description: t`Points to another table to make a connection.`,
    icon: "connections",
  },

  /* Common */
  {
    id: TYPE.Category,
    name: t`Category`,
    section: t`Common`,
    icon: "string",
  },
  {
    id: TYPE.Comment,
    name: t`Comment`,
    section: t`Common`,
    icon: "string",
  },
  {
    id: TYPE.Description,
    name: t`Description`,
    section: t`Common`,
    icon: "string",
  },
  {
    id: TYPE.Title,
    name: t`Title`,
    section: t`Common`,
    icon: "string",
  },

  /* Location */
  {
    id: TYPE.City,
    name: t`City`,
    section: t`Location`,
    icon: "location",
  },
  {
    id: TYPE.Country,
    name: t`Country`,
    section: t`Location`,
    icon: "location",
  },
  {
    id: TYPE.Latitude,
    name: t`Latitude`,
    section: t`Location`,
    icon: "location",
  },
  {
    id: TYPE.Longitude,
    name: t`Longitude`,
    section: t`Location`,
    icon: "location",
  },
  {
    id: TYPE.State,
    name: t`State`,
    section: t`Location`,
    icon: "location",
  },
  {
    id: TYPE.ZipCode,
    name: t`Zip Code`,
    section: t`Location`,
    icon: "location",
  },

  /* Financial */
  {
    id: TYPE.Cost,
    name: t`Cost`,
    section: t`Financial`,
    icon: "int",
  },
  {
    id: TYPE.Currency,
    name: t`Currency`,
    section: t`Financial`,
    icon: "int",
  },
  {
    id: TYPE.Discount,
    name: t`Discount`,
    section: t`Financial`,
    icon: "int",
  },
  {
    id: TYPE.GrossMargin,
    name: t`Gross margin`,
    section: t`Financial`,
    icon: "int",
  },
  {
    id: TYPE.Income,
    name: t`Income`,
    section: t`Financial`,
    icon: "int",
  },
  {
    id: TYPE.Price,
    name: t`Price`,
    section: t`Financial`,
    icon: "int",
  },

  /* Numeric */
  {
    id: TYPE.Quantity,
    name: t`Quantity`,
    section: t`Numeric`,
    icon: "int",
  },
  {
    id: TYPE.Score,
    name: t`Score`,
    section: t`Numeric`,
    icon: "int",
  },
  {
    id: TYPE.Share,
    name: t`Share`,
    section: t`Numeric`,
    icon: "int",
  },
  {
    id: TYPE.Percentage,
    name: t`Percentage`,
    section: t`Numeric`,
    icon: "int",
  },

  /* Profile */
  {
    id: TYPE.Birthdate,
    name: t`Birthday`,
    section: t`Profile`,
    icon: "birthday",
  },
  {
    id: TYPE.Company,
    name: t`Company`,
    section: t`Profile`,
    icon: "string",
  },
  {
    id: TYPE.Email,
    name: t`Email`,
    section: t`Profile`,
    icon: "string",
  },
  {
    id: TYPE.Owner,
    name: t`Owner`,
    section: t`Profile`,
    icon: "string",
  },
  {
    id: TYPE.Subscription,
    name: t`Subscription`,
    section: t`Profile`,
    icon: "string",
  },
  {
    id: TYPE.User,
    name: t`User`,
    section: t`Profile`,
    icon: "string",
  },

  /* Date and Time */
  {
    id: TYPE.CancelationDate,
    name: t`Cancelation date`,
    section: t`Date and Time`,
    icon: "calendar",
  },
  {
    id: TYPE.CancelationTime,
    name: t`Cancelation time`,
    section: t`Date and Time`,
    icon: "calendar",
  },
  {
    id: TYPE.CancelationTimestamp,
    name: t`Cancelation timestamp`,
    section: t`Date and Time`,
    icon: "calendar",
  },
  {
    id: TYPE.CreationDate,
    name: t`Creation date`,
    section: t`Date and Time`,
    icon: "calendar",
  },
  {
    id: TYPE.CreationTime,
    name: t`Creation time`,
    section: t`Date and Time`,
    icon: "calendar",
  },
  {
    id: TYPE.CreationTimestamp,
    name: t`Creation timestamp`,
    section: t`Date and Time`,
    icon: "calendar",
  },
  {
    id: TYPE.DeletionDate,
    name: t`Deletion date`,
    section: t`Date and Time`,
    icon: "calendar",
  },
  {
    id: TYPE.DeletionTime,
    name: t`Deletion time`,
    section: t`Date and Time`,
    icon: "calendar",
  },
  {
    id: TYPE.DeletionTimestamp,
    name: t`Deletion timestamp`,
    section: t`Date and Time`,
    icon: "calendar",
  },
  {
    id: TYPE.UpdatedDate,
    name: t`Updated date`,
    section: t`Date and Time`,
    icon: "calendar",
  },
  {
    id: TYPE.UpdatedTime,
    name: t`Updated time`,
    section: t`Date and Time`,
    icon: "calendar",
  },
  {
    id: TYPE.UpdatedTimestamp,
    name: t`Updated timestamp`,
    section: t`Date and Time`,
    icon: "calendar",
  },
  {
    id: TYPE.JoinDate,
    name: t`Join date`,
    section: t`Date and Time`,
    icon: "calendar",
  },
  {
    id: TYPE.JoinTime,
    name: t`Join time`,
    section: t`Date and Time`,
    icon: "calendar",
  },
  {
    id: TYPE.JoinTimestamp,
    name: t`Join timestamp`,
    section: t`Date and Time`,
    icon: "calendar",
  },

  /* Categorical */
  {
    id: TYPE.Enum,
    name: t`Enum`,
    section: t`Categorical`,
    icon: "string",
  },
  {
    id: TYPE.Product,
    name: t`Product`,
    section: t`Categorical`,
    icon: "string",
  },
  {
    id: TYPE.Source,
    name: t`Source`,
    section: t`Categorical`,
    icon: "string",
  },

  /* URLs */
  {
    id: TYPE.AvatarURL,
    name: t`Avatar Image URL`,
    section: t`URLs`,
    icon: "string",
  },
  {
    id: TYPE.ImageURL,
    name: t`Image URL`,
    section: t`URLs`,
    icon: "string",
  },
  {
    id: TYPE.URL,
    name: t`URL`,
    section: t`URLs`,
    icon: "string",
  },

  /* Other */
  {
    id: TYPE.SerializedJSON,
    name: t`Field containing JSON`,
    section: t`Other`,
    icon: "string",
  },
];

export const field_semantic_types_map = field_semantic_types.reduce(
  (map, type) => Object.assign({}, map, { [type.id]: type }),
  {},
);

export const has_field_values_options = [
  { name: t`Search box`, value: "search" },
  { name: t`A list of all values`, value: "list" },
  { name: t`Plain input box`, value: "none" },
];

export const field_visibility_types = [
  {
    id: "normal",
    name: t`Everywhere`,
    description: t`The default setting. This field will be displayed normally in tables and charts.`,
  },
  {
    id: "details-only",
    name: t`Only in detail views`,
    description: t`This field will only be displayed when viewing the details of a single record. Use this for information that's lengthy or that isn't useful in a table or chart.`,
  },
  {
    id: "sensitive",
    name: t`Do not include`,
    description: t`This field won't be visible or selectable in questions created with the GUI interfaces. It will still be accessible in SQL/native queries.`,
  },
];
