import { TYPE } from "metabase/lib/types";
import { t } from "c-3po";

export const field_special_types = [
  {
    id: TYPE.PK,
    name: t`Entity Key`,
    section: t`Overall Row`,
    description: t`The primary key for this table.`,
  },
  {
    id: TYPE.Name,
    name: t`Entity Name`,
    section: t`Overall Row`,
    description: t`The "name" of each record. Usually a column called "name", "title", etc.`,
  },
  {
    id: TYPE.FK,
    name: t`Foreign Key`,
    section: t`Overall Row`,
    description: t`Points to another table to make a connection.`,
  },
  {
    id: TYPE.AvatarURL,
    name: t`Avatar Image URL`,
    section: t`Common`,
  },
  {
    id: TYPE.Category,
    name: t`Category`,
    section: t`Common`,
  },
  {
    id: TYPE.City,
    name: t`City`,
    section: t`Common`,
  },
  {
    id: TYPE.Country,
    name: t`Country`,
    section: t`Common`,
  },
  {
    id: TYPE.Description,
    name: t`Description`,
    section: t`Common`,
  },
  {
    id: TYPE.Email,
    name: t`Email`,
    section: t`Common`,
  },
  {
    id: TYPE.Enum,
    name: t`Enum`,
    section: t`Common`,
  },
  {
    id: TYPE.ImageURL,
    name: t`Image URL`,
    section: t`Common`,
  },
  {
    id: TYPE.SerializedJSON,
    name: t`Field containing JSON`,
    section: t`Common`,
  },
  {
    id: TYPE.Latitude,
    name: t`Latitude`,
    section: t`Common`,
  },
  {
    id: TYPE.Longitude,
    name: t`Longitude`,
    section: t`Common`,
  },
  {
    id: TYPE.Number,
    name: t`Number`,
    section: t`Common`,
  },
  {
    id: TYPE.State,
    name: t`State`,
    section: t`Common`,
  },
  {
    id: TYPE.UNIXTimestampSeconds,
    name: t`UNIX Timestamp (Seconds)`,
    section: t`Common`,
  },
  {
    id: TYPE.UNIXTimestampMilliseconds,
    name: t`UNIX Timestamp (Milliseconds)`,
    section: t`Common`,
  },
  {
    id: TYPE.URL,
    name: t`URL`,
    section: t`Common`,
  },
  {
    id: TYPE.ZipCode,
    name: t`Zip Code`,
    section: t`Common`,
  },
  {
    id: TYPE.Quantity,
    name: t`Quantity`,
    section: t`Common`,
  },
  {
    id: TYPE.Income,
    name: t`Income`,
    section: t`Common`,
  },
  {
    id: TYPE.Discount,
    name: t`Discount`,
    section: t`Common`,
  },
  {
    id: TYPE.CreationTimestamp,
    name: t`Creation timestamp`,
    section: t`Common`,
  },
  {
    id: TYPE.Product,
    name: t`Product`,
    section: t`Common`,
  },
  {
    id: TYPE.User,
    name: t`User`,
    section: t`Common`,
  },
  {
    id: TYPE.Source,
    name: t`Source`,
    section: t`Common`,
  },
  {
    id: TYPE.Price,
    name: t`Price`,
    section: t`Common`,
  },
  {
    id: TYPE.JoinTimestamp,
    name: t`Join timestamp`,
    section: t`Common`,
  },
  {
    id: TYPE.Share,
    name: t`Share`,
    section: t`Common`,
  },
  {
    id: TYPE.Owner,
    name: t`Owner`,
    section: t`Common`,
  },
  {
    id: TYPE.Company,
    name: t`Company`,
    section: t`Common`,
  },
  {
    id: TYPE.Subscription,
    name: t`Subscription`,
    section: t`Common`,
  },
  {
    id: TYPE.Score,
    name: t`Score`,
    section: t`Common`,
  },
  {
    id: TYPE.Description,
    name: t`Description`,
    section: t`Common`,
  },
  {
    id: TYPE.Title,
    name: t`Title`,
    section: t`Common`,
  },
  {
    id: TYPE.Comment,
    name: t`Comment`,
    section: t`Common`,
  },
  {
    id: TYPE.Cost,
    name: t`Cost`,
    section: t`Common`,
  },
  {
    id: TYPE.GrossMargin,
    name: t`Gross margin`,
    section: t`Common`,
  },
  {
    id: TYPE.Birthdate,
    name: t`Birthday`,
    section: t`Common`,
  },
];

export const field_special_types_map = field_special_types.reduce(
  (map, type) => Object.assign({}, map, { [type.id]: type }),
  {},
);

export const field_visibility_types = [
  {
    id: "normal",
    name: t`Everywhere`,
    description: t`The default setting. This field will be displayed normally in tables and charts.`,
  },
  {
    id: "details-only",
    name: t`Only in Detail Views`,
    description: t`This field will only be displayed when viewing the details of a single record. Use this for information that's lengthy or that isn't useful in a table or chart.`,
  },
  {
    id: "sensitive",
    name: t`Do Not Include`,
    description: t`Metabase will never retrieve this field. Use this for sensitive or irrelevant information.`,
  },
];
