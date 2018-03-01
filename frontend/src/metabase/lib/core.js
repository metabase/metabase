import { TYPE } from "metabase/lib/types";
import { t } from "c-3po";

export const field_special_types = [
  {
    id: TYPE.PK,
    name: t`Entity Key`,
    section: "Overall Row",
    description: t`The primary key for this table.`,
  },
  {
    id: TYPE.Name,
    name: t`Entity Name`,
    section: "Overall Row",
    description: t`The "name" of each record. Usually a column called "name", "title", etc.`,
  },
  {
    id: TYPE.FK,
    name: t`Foreign Key`,
    section: "Overall Row",
    description: t`Points to another table to make a connection.`,
  },
  {
    id: TYPE.AvatarURL,
    name: t`Avatar Image URL`,
    section: "Common",
  },
  {
    id: TYPE.Category,
    name: t`Category`,
    section: "Common",
  },
  {
    id: TYPE.City,
    name: t`City`,
    section: "Common",
  },
  {
    id: TYPE.Country,
    name: t`Country`,
    section: "Common",
  },
  {
    id: TYPE.Description,
    name: t`Description`,
    section: "Common",
  },
  {
    id: TYPE.Email,
    name: t`Email`,
    section: "Common",
  },
  {
    id: TYPE.Enum,
    name: t`Enum`,
    section: "Common",
  },
  {
    id: TYPE.ImageURL,
    name: t`Image URL`,
    section: "Common",
  },
  {
    id: TYPE.SerializedJSON,
    name: t`Field containing JSON`,
    section: "Common",
  },
  {
    id: TYPE.Latitude,
    name: t`Latitude`,
    section: "Common",
  },
  {
    id: TYPE.Longitude,
    name: t`Longitude`,
    section: "Common",
  },
  {
    id: TYPE.Number,
    name: t`Number`,
    section: "Common",
  },
  {
    id: TYPE.State,
    name: t`State`,
    section: "Common",
  },
  {
    id: TYPE.UNIXTimestampSeconds,
    name: t`UNIX Timestamp (Seconds)`,
    section: "Common",
  },
  {
    id: TYPE.UNIXTimestampMilliseconds,
    name: t`UNIX Timestamp (Milliseconds)`,
    section: "Common",
  },
  {
    id: TYPE.URL,
    name: t`URL`,
    section: "Common",
  },
  {
    id: TYPE.ZipCode,
    name: t`Zip Code`,
    section: "Common",
  },
  {
    id: TYPE.Quantity,
    name: "Quantity",
    section: "Common",
  },
  {
    id: TYPE.Income,
    name: "Income",
    section: "Common",
  },
  {
    id: TYPE.Discount,
    name: "Discount",
    section: "Common",
  },
  {
    id: TYPE.CreationTimestamp,
    name: "Creation timestamp",
    section: "Common",
  },
  {
    id: TYPE.Product,
    name: "Product",
    section: "Common",
  },
  {
    id: TYPE.User,
    name: "User",
    section: "Common",
  },
  {
    id: TYPE.Source,
    name: "Source",
    section: "Common",
  },
  {
    id: TYPE.Price,
    name: "Price",
    section: "Common",
  },
  {
    id: TYPE.JoinTimestamp,
    name: "Join timestamp",
    section: "Common",
  },
  {
    id: TYPE.Share,
    name: "Share",
    section: "Common",
  },
  {
    id: TYPE.Owner,
    name: "Owner",
    section: "Common",
  },
  {
    id: TYPE.Company,
    name: "Company",
    section: "Common",
  },
  {
    id: TYPE.Subscription,
    name: "Subscription",
    section: "Common",
  },
  {
    id: TYPE.Score,
    name: "Score",
    section: "Common",
  },
  {
    id: TYPE.Description,
    name: "Description",
    section: "Common",
  },
  {
    id: TYPE.Title,
    name: "Title",
    section: "Common",
  },
  {
    id: TYPE.Comment,
    name: "Comment",
    section: "Common",
  },
  {
    id: TYPE.Cost,
    name: "Cost",
    section: "Common",
  },
  {
    id: TYPE.GrossMargin,
    name: "Gross margin",
    section: "Common",
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
